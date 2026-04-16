const ko = require('knockout');
const octicons = require('octicons');
const components = require('ungit-components');
const { encodePath } = require('ungit-address-parser');

components.register('home', (args) => new HomeViewModel(args.app));

const TYPES_VIEW = {
  list: 'List',
  block: 'Block'
};

class HomeRepositoryViewModel {
  constructor(home, path, groupName) {
    this.home = home;
    this.app = home.app;
    this.server = this.app.server;
    this.path = path;
    this.title = path;
    this.projectname = path.split('/').pop();
    this.groupName = ko.observable(groupName || '');
    this.link = `${ungit.config.rootPath}/#/repository?path=${encodePath(path)}`;
    this.pathRemoved = ko.observable(false);
    this.remote = ko.observable('...');
    this.isDragging = ko.observable(false);
    this.updateState();
    this.removeIcon = octicons['x-circle'].toSVG({ height: 18 });
    this.arrowIcon = octicons['file-directory-open-fill'].toSVG({ height: 24 });
    this.starEmptyIcon = octicons['star'].toSVG({ height: 24 });
    this.starFillIcon = octicons['star-fill'].toSVG({ height: 24 });
    this.moveUpIcon = octicons['arrow-up'].toSVG({ height: 16 });
    this.moveDownIcon = octicons['arrow-down'].toSVG({ height: 16 });
    this.dragHandleIcon = octicons['grabber'].toSVG({ height: 32 });
  }

  updateGroupName(groupName) {
    this.groupName(groupName || '');
  }

  updateState() {
    this.server
      .getPromise(`/fs/exists?path=${encodePath(this.path)}`)
      .then((exists) => {
        this.pathRemoved(!exists);
      })
      .catch((e) => this.server.unhandledRejection(e));
    this.server
      .getPromise(`/remotes/origin?path=${encodePath(this.path)}`)
      .then((remote) => {
        this.remote(remote.address.replace(/\/\/.*?@/, '//***@'));
      })
      .catch(() => {
        this.remote('');
      });
  }

  remove() {
    this.app.removeRepository(this.path);
    this.home.update();
    return false;
  }

  favorite() {
    this.app.toggleFavorite(this.path);
    this.home.update();
    return false;
  }

  isFavorite() {
    return this.app.isFavorite(this.path);
  }

  isListView() {
    return this.home.typeViewSelected() == TYPES_VIEW.list;
  }

  canMoveUp() {
    return this.app.canMoveRepository(this.path, -1);
  }

  canMoveDown() {
    return this.app.canMoveRepository(this.path, 1);
  }

  moveUp() {
    this.app.moveRepository(this.path, -1);
    this.home.update();
    return false;
  }

  moveDown() {
    this.app.moveRepository(this.path, 1);
    this.home.update();
    return false;
  }

  onGroupChanged(_data, event) {
    if (!event || !event.target) return true;
    this.app.setRepositoryGroup(this.path, event.target.value || '');
    this.home.update();
    return true;
  }

  onDragStart(isDragging) {
    this.isDragging(Boolean(isDragging));
  }

  onDragEnd(isDragging) {
    this.isDragging(Boolean(isDragging));
  }
}

class HomeViewModel {
  constructor(app) {
    this.app = app;
    this.groups = ko.observableArray();
    this.ungroupedRepos = ko.observableArray();
    this.favoritesRepos = ko.observableArray();

    // --- Modal system ---
    this.modal = {
      visible: ko.observable(false),
      type: ko.observable('alert'), // 'alert' | 'confirm' | 'prompt'
      title: ko.observable(''),
      message: ko.observable(''),
      inputValue: ko.observable(''),
      _resolve: null,
    };
    this.modal.ok = () => {
      const resolve = this.modal._resolve;
      this.modal.visible(false);
      this.modal._resolve = null;
      if (resolve) {
        if (this.modal.type() === 'confirm') resolve(true);
        else if (this.modal.type() === 'prompt') resolve(this.modal.inputValue());
        else resolve();
      }
    };
    this.modal.cancel = () => {
      const resolve = this.modal._resolve;
      this.modal.visible(false);
      this.modal._resolve = null;
      if (resolve) {
        if (this.modal.type() === 'confirm') resolve(false);
        else if (this.modal.type() === 'prompt') resolve(null);
        else resolve();
      }
    };
    // --- end modal system ---
    this.repositoriesByPath = {};
    this.showNux = ko.computed(() => this.app.repoList().length == 0);
    this.ungroupedDropActive = ko.observable(false);
    this.addIcon = octicons.plus.toSVG({ height: 18 });
    this.typeViews = Object.values(TYPES_VIEW);
    this.typeViewSelected = ko.observable(TYPES_VIEW.block);
    this.viewBlockIcon = octicons['apps'].toSVG({ height: 24 });
    this.viewListIcon = octicons['list-unordered'].toSVG({ height: 24 });
    this.exportIcon = octicons['download'].toSVG({ height: 16 });
    this.importIcon = octicons['upload'].toSVG({ height: 16 });
    this.groupIcon = octicons['repo'].toSVG({ height: 16 });
    this.editIcon = octicons['pencil'].toSVG({ height: 16 });
    this.starFillIcon = octicons['star-fill'].toSVG({ height: 16 });
    this.groupNameInput = ko.observable('');
    this.isCreatingGroup = ko.observable(false);
    this.repositoryFilter = ko.observable('');
    this.importInputElement = ko.observable();
    this.hasGroups = ko.computed(() => this.app.getGroupsAlphabetical().length > 0);
    this.groupOptionsWithEmpty = ko.computed(() => [
      { label: 'Sem grupo', value: '' },
      ...this.app.getGroupsAlphabetical().map((groupName) => ({
        label: groupName,
        value: groupName,
      })),
    ]);

    this.app.repoList.subscribe(() => this.update());
    this.app.repoFavoriteList.subscribe(() => this.update());
    this.app.repoMetadata.subscribe(() => this.update());
    this.repositoryFilter.subscribe(() => this.update());
  }

  _alert(message, title) {
    return new Promise((resolve) => {
      this.modal.type('alert');
      this.modal.title(title || 'Atenção');
      this.modal.message(message);
      this.modal.inputValue('');
      this.modal._resolve = resolve;
      this.modal.visible(true);
    });
  }

  _confirm(message, title) {
    return new Promise((resolve) => {
      this.modal.type('confirm');
      this.modal.title(title || 'Confirmação');
      this.modal.message(message);
      this.modal.inputValue('');
      this.modal._resolve = resolve;
      this.modal.visible(true);
    });
  }

  _prompt(message, defaultValue, title) {
    return new Promise((resolve) => {
      this.modal.type('prompt');
      this.modal.title(title || 'Entrada');
      this.modal.message(message);
      this.modal.inputValue(defaultValue || '');
      this.modal._resolve = resolve;
      this.modal.visible(true);
    });
  }

  isListView() {
    return this.typeViewSelected() == TYPES_VIEW.list;
  }

  setViewList() {
    this.typeViewSelected(TYPES_VIEW.list);
  }

  setViewBlock() {
    this.typeViewSelected(TYPES_VIEW.block);
  }

  updateNode(parentElement) {
    ko.renderTemplate('home', this, {}, parentElement);
  }

  shown() {
    this.update();
  }

  cancelCreateGroup() {
    this.groupNameInput('');
    this.isCreatingGroup(false);
    return false;
  }

  createGroup() {
    if (!this.isCreatingGroup()) {
      this.isCreatingGroup(true);
      return false;
    }
    const created = this.app.createGroup(this.groupNameInput());
    if (created) {
      this.groupNameInput('');
      this.isCreatingGroup(false);
      this.update();
    }
    return false;
  }

  _matchesRepositoryFilter(repository) {
    const normalizedFilter = this.repositoryFilter().trim().toLowerCase();
    if (!normalizedFilter) return true;
    const normalizedPath = (repository.path || '').toLowerCase();
    const normalizedRemote = (repository.remote() || '').toLowerCase();
    return normalizedPath.includes(normalizedFilter) || normalizedRemote.includes(normalizedFilter);
  }

  renameGroup(groupViewModel) {
    this._prompt('Novo nome do grupo:', groupViewModel.name, 'Renomear grupo').then((newName) => {
      if (!newName) return;
      this.app.renameGroup(groupViewModel.name, newName);
      this.update();
    });
    return false;
  }

  removeGroup(groupViewModel) {
    this._confirm(
      `Remover o grupo "${groupViewModel.name}"? Os repositórios irão para Sem grupo.`,
      'Remover grupo'
    ).then((shouldRemove) => {
      if (!shouldRemove) return;
      this.app.removeGroup(groupViewModel.name);
      this.update();
    });
    return false;
  }

  exportRepositories() {
    const payload = this.app.exportRepositoriesData();
    const content = JSON.stringify(payload, null, 2);
    const blob = new Blob([content], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `ungit-repositories-${Date.now()}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    return false;
  }

  triggerImport() {
    const input = this.importInputElement();
    if (!input) return false;
    input.value = '';
    input.click();
    return false;
  }

  importFromFile(_data, event) {
    const selectedFile = event && event.target && event.target.files ? event.target.files[0] : null;
    if (!selectedFile) return true;

    const reader = new FileReader();
    reader.onload = () => {
      let payload;
      try {
        payload = JSON.parse(reader.result);
      } catch {
        this._alert('Arquivo JSON inválido para importação.', 'Erro');
        return;
      }
      this._prompt(
        'Digite M para Mesclar ou R para Substituir os dados atuais:',
        'M',
        'Modo de importação'
      ).then((modeHint) => {
        if (!modeHint) return;
        const mode = modeHint.toLowerCase().startsWith('r') ? 'replace' : 'merge';
        this.app.importRepositoriesData(payload, mode);
        this.update();
      });
    };
    reader.readAsText(selectedFile);
    return true;
  }

  onUngroupedDragEnter(draggedRepository) {
    if (!draggedRepository || !draggedRepository.groupName()) return;
    this.ungroupedDropActive(true);
  }

  onUngroupedDragLeave() {
    this.ungroupedDropActive(false);
  }

  onUngroupedDrop(draggedRepository) {
    this.ungroupedDropActive(false);
    if (!draggedRepository || !draggedRepository.path) return;
    this.app.setRepositoryGroup(draggedRepository.path, '');
    this.update();
  }

  _createGroupViewModel(groupName, repositories) {
    const groupViewModel = {
      name: groupName,
      repos: repositories,
      dropActive: ko.observable(false),
    };

    groupViewModel.onDragEnter = (draggedRepository) => {
      if (!draggedRepository || draggedRepository.groupName() === groupName) return;
      groupViewModel.dropActive(true);
    };

    groupViewModel.onDragLeave = () => {
      groupViewModel.dropActive(false);
    };

    groupViewModel.onDrop = (draggedRepository) => {
      groupViewModel.dropActive(false);
      if (!draggedRepository || !draggedRepository.path) return;
      this.app.setRepositoryGroup(draggedRepository.path, groupName);
      this.update();
    };

    return groupViewModel;
  }

  _getOrCreateRepository(path, groupName) {
    if (!this.repositoriesByPath[path]) {
      this.repositoriesByPath[path] = new HomeRepositoryViewModel(this, path, groupName);
    }
    this.repositoriesByPath[path].updateGroupName(groupName);
    return this.repositoriesByPath[path];
  }

  update() {
    const groups = this.app
      .getGroupsAlphabetical()
      .map((groupName) => {
        const repositories = this.app
          .getRepositoriesByGroup(groupName)
          .map((path) => this._getOrCreateRepository(path, groupName))
          .filter((repository) => this._matchesRepositoryFilter(repository));
        return this._createGroupViewModel(groupName, repositories);
      })
      .filter((groupViewModel) => groupViewModel.repos.length > 0);

    const ungrouped = this.app
      .getUngroupedRepositories()
      .map((path) => this._getOrCreateRepository(path, ''))
      .filter((repository) => this._matchesRepositoryFilter(repository));

    const allPaths = [
      ...this.app.getGroupsAlphabetical().flatMap((g) => this.app.getRepositoriesByGroup(g)),
      ...this.app.getUngroupedRepositories(),
    ];
    const favoriteRepos = allPaths
      .filter((path) => this.app.isFavorite(path))
      .map((path) => this.repositoriesByPath[path])
      .filter((repository) => repository && this._matchesRepositoryFilter(repository))
      .sort((a, b) => a.projectname.localeCompare(b.projectname));

    this.ungroupedDropActive(false);
    this.groups(groups);
    this.ungroupedRepos(ungrouped);
    this.favoritesRepos(favoriteRepos);
  }

  get template() {
    return 'home';
  }
}
