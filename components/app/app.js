const ko = require('knockout');
const components = require('ungit-components');
const storage = require('ungit-storage');
const $ = require('jquery');

const REPOSITORIES_METADATA_KEY = 'repositoriesMetadata';
const REPOSITORIES_METADATA_VERSION = 1;
const UNGROUPED_REPOSITORIES_KEY = '__ungrouped__';

components.register('app', (args) => {
  return new AppViewModel(args.appContainer, args.server);
});

class AppViewModel {
  constructor(appContainer, server) {
    this.appContainer = appContainer;
    this.server = server;
    this.template = 'app';
    if (window.location.search.indexOf('noheader=true') < 0) {
      this.header = components.create('header', { app: this });
    }
    this.modal = ko.observable(null);
    const repoState = this.getRepositoryState();
    this.repoList = ko.observableArray(repoState.repositories);
    this.repoList.subscribe((newValue) => {
      storage.setItem('repositories', JSON.stringify(newValue));
    });
    this.repoFavoriteList = ko.observableArray(repoState.favorites);
    this.repoFavoriteList.subscribe((newValue) => {
      storage.setItem('favoriteRepositories', JSON.stringify(newValue));
    });
    this.repoMetadata = ko.observable(repoState.metadata);
    this.repoMetadata.subscribe((newValue) => {
      storage.setItem(REPOSITORIES_METADATA_KEY, JSON.stringify(newValue));
    });
    this.content = ko.observable(components.create('home', { app: this }));
    this.currentVersion = ko.observable();
    this.latestVersion = ko.observable();
    this.showNewVersionAvailable = ko.observable();
    this.newVersionInstallCommand =
      (ungit.platform == 'win32' ? '' : 'sudo -H ') + 'npm update -g ungit';
    this.bugtrackingEnabled = ko.observable(ungit.config.bugtracking);
    this.bugtrackingNagscreenDismissed = ko.observable(
      storage.getItem('bugtrackingNagscreenDismissed')
    );
    this.showBugtrackingNagscreen = ko.computed(() => {
      return !this.bugtrackingEnabled() && !this.bugtrackingNagscreenDismissed();
    });
    this.gitVersionErrorDismissed = ko.observable(storage.getItem('gitVersionErrorDismissed'));
    this.gitVersionError = ko.observable();
    this.gitVersionErrorVisible = ko.computed(() => {
      return (
        !ungit.config.gitVersionCheckOverride &&
        this.gitVersionError() &&
        !this.gitVersionErrorDismissed()
      );
    });
  }

  _safeParseJson(value, fallbackValue) {
    try {
      const parsed = JSON.parse(value);
      return parsed === null || parsed === undefined ? fallbackValue : parsed;
    } catch {
      return fallbackValue;
    }
  }

  _uniquePaths(paths) {
    const normalized = Array.isArray(paths)
      ? paths.filter((path) => typeof path === 'string').map((path) => path.trim()).filter(Boolean)
      : [];
    return normalized.filter((path, index) => normalized.indexOf(path) === index);
  }

  _sortByProjectName(paths) {
    return [...paths].sort((a, b) => {
      const aName = a.split('/').pop();
      const bName = b.split('/').pop();
      return aName.localeCompare(bName);
    });
  }

  _normalizeRepositoryState(repositories, favorites, metadata) {
    const repoList = this._uniquePaths(repositories);
    const favoriteSet = new Set(this._uniquePaths(favorites));
    const baseMetadata = metadata && typeof metadata === 'object' ? metadata : {};
    const groups = Array.isArray(baseMetadata.groups)
      ? baseMetadata.groups
          .filter((group) => typeof group === 'string')
          .map((group) => group.trim())
          .filter(Boolean)
      : [];
    const uniqueGroups = groups.filter((group, index) => groups.indexOf(group) === index);

    const assignments = {};
    const sourceAssignments =
      baseMetadata.assignments && typeof baseMetadata.assignments === 'object'
        ? baseMetadata.assignments
        : {};
    repoList.forEach((path) => {
      const groupName = sourceAssignments[path];
      if (typeof groupName === 'string' && groupName.trim()) {
        const normalizedGroupName = groupName.trim();
        assignments[path] = normalizedGroupName;
        if (!uniqueGroups.includes(normalizedGroupName)) {
          uniqueGroups.push(normalizedGroupName);
        }
      }
    });

    const memberships = {};
    uniqueGroups.forEach((groupName) => {
      memberships[groupName] = [];
    });
    memberships[UNGROUPED_REPOSITORIES_KEY] = [];

    repoList.forEach((path) => {
      const groupName = assignments[path];
      if (groupName) {
        memberships[groupName].push(path);
      } else {
        memberships[UNGROUPED_REPOSITORIES_KEY].push(path);
      }
    });

    const sourceOrders =
      baseMetadata.orders && typeof baseMetadata.orders === 'object' ? baseMetadata.orders : {};
    const orders = {};
    Object.keys(memberships).forEach((groupKey) => {
      const groupMembers = memberships[groupKey];
      const knownMembers = new Set(groupMembers);
      const currentOrder = this._uniquePaths(sourceOrders[groupKey] || []).filter((path) =>
        knownMembers.has(path)
      );
      const missingMembers = this._sortByProjectName(
        groupMembers.filter((path) => !currentOrder.includes(path))
      );
      orders[groupKey] = [...currentOrder, ...missingMembers];
    });

    const sortedGroups = [...uniqueGroups];
    const flattenedRepositories = [];
    sortedGroups.forEach((groupName) => {
      flattenedRepositories.push(...orders[groupName]);
    });
    flattenedRepositories.push(...orders[UNGROUPED_REPOSITORIES_KEY]);

    const favoriteRepositories = flattenedRepositories.filter((path) => favoriteSet.has(path));
    const normalizedMetadata = {
      version: REPOSITORIES_METADATA_VERSION,
      groups: sortedGroups,
      assignments,
      orders,
    };

    return {
      repositories: flattenedRepositories,
      favorites: favoriteRepositories,
      metadata: normalizedMetadata,
    };
  }

  getRepositoryState() {
    const localStorageRepo = this._safeParseJson(
      storage.getItem('repositories') || storage.getItem('visitedRepositories') || '[]',
      []
    );
    const defaultRepositories = Array.isArray(ungit.config.defaultRepositories)
      ? ungit.config.defaultRepositories
      : [];
    const repositories = this._uniquePaths([...localStorageRepo, ...defaultRepositories]);
    const favorites = this._safeParseJson(storage.getItem('favoriteRepositories') || '[]', []);
    const metadata = this._safeParseJson(storage.getItem(REPOSITORIES_METADATA_KEY) || '{}', {});

    return this._normalizeRepositoryState(repositories, favorites, metadata);
  }

  _applyRepositoryState(nextState) {
    this.repoList(nextState.repositories);
    this.repoFavoriteList(nextState.favorites);
    this.repoMetadata(nextState.metadata);
  }

  _saveNormalizedRepositoryState(repositories, favorites, metadata) {
    const normalizedState = this._normalizeRepositoryState(repositories, favorites, metadata);
    this._applyRepositoryState(normalizedState);
    return normalizedState;
  }

  _getRepositoryGroupName(path) {
    const metadata = this.repoMetadata() || {};
    const assignments = metadata.assignments || {};
    return assignments[path] || '';
  }

  _getRepositoryGroupKey(path) {
    const groupName = this._getRepositoryGroupName(path);
    return groupName || UNGROUPED_REPOSITORIES_KEY;
  }

  _rebuildOrderForGroup(groupKey, currentRepositories) {
    const metadata = this.repoMetadata() || {};
    const assignments = metadata.assignments || {};
    const orders = metadata.orders || {};
    const members = currentRepositories.filter((path) => {
      const assignedGroup = assignments[path] || '';
      if (groupKey === UNGROUPED_REPOSITORIES_KEY) {
        return !assignedGroup;
      }
      return assignedGroup === groupKey;
    });
    const currentOrder = this._uniquePaths(orders[groupKey] || []).filter((path) =>
      members.includes(path)
    );
    const missing = this._sortByProjectName(members.filter((path) => !currentOrder.includes(path)));
    return [...currentOrder, ...missing];
  }

  addRepository(path) {
    if (!path || typeof path !== 'string') return;
    const normalizedPath = path.trim();
    if (!normalizedPath) return;
    const repositories = this.repoList();
    if (repositories.includes(normalizedPath)) return;
    this._saveNormalizedRepositoryState(
      [...repositories, normalizedPath],
      this.repoFavoriteList(),
      this.repoMetadata()
    );
  }

  removeRepository(path) {
    const repositories = this.repoList().filter((repoPath) => repoPath !== path);
    const favorites = this.repoFavoriteList().filter((repoPath) => repoPath !== path);
    const metadata = this.repoMetadata() || {};
    const assignments = { ...(metadata.assignments || {}) };
    delete assignments[path];
    const orders = { ...(metadata.orders || {}) };
    Object.keys(orders).forEach((groupKey) => {
      orders[groupKey] = (orders[groupKey] || []).filter((repoPath) => repoPath !== path);
    });
    this._saveNormalizedRepositoryState(repositories, favorites, {
      ...metadata,
      assignments,
      orders,
    });
  }

  toggleFavorite(path) {
    const favorites = this.repoFavoriteList();
    if (favorites.includes(path)) {
      this.repoFavoriteList(favorites.filter((repoPath) => repoPath !== path));
      return;
    }
    this.repoFavoriteList([...favorites, path]);
  }

  isFavorite(path) {
    return this.repoFavoriteList().includes(path);
  }

  getGroupsAlphabetical() {
    const metadata = this.repoMetadata() || {};
    const groups = Array.isArray(metadata.groups) ? metadata.groups : [];
    return [...groups];
  }

  canMoveGroup(groupName, direction) {
    const groups = this.getGroupsAlphabetical();
    const currentIndex = groups.indexOf(groupName);
    if (currentIndex === -1) return false;
    const nextIndex = currentIndex + direction;
    return nextIndex >= 0 && nextIndex < groups.length;
  }

  moveGroup(groupName, direction) {
    if (!this.canMoveGroup(groupName, direction)) return false;
    const metadata = this.repoMetadata() || {};
    const groups = this.getGroupsAlphabetical();
    const currentIndex = groups.indexOf(groupName);
    const nextIndex = currentIndex + direction;
    [groups[currentIndex], groups[nextIndex]] = [groups[nextIndex], groups[currentIndex]];
    this._saveNormalizedRepositoryState(this.repoList(), this.repoFavoriteList(), {
      ...metadata,
      groups,
    });
    return true;
  }

  getRepositoriesByGroup(groupName) {
    const metadata = this.repoMetadata() || {};
    const orders = metadata.orders || {};
    return this._uniquePaths(orders[groupName] || []).filter((path) => this.repoList().includes(path));
  }

  getUngroupedRepositories() {
    const metadata = this.repoMetadata() || {};
    const orders = metadata.orders || {};
    return this._uniquePaths(orders[UNGROUPED_REPOSITORIES_KEY] || []).filter((path) =>
      this.repoList().includes(path)
    );
  }

  createGroup(groupName) {
    if (!groupName || typeof groupName !== 'string') return false;
    const normalizedGroupName = groupName.trim();
    if (!normalizedGroupName) return false;
    const groups = this.getGroupsAlphabetical();
    if (groups.includes(normalizedGroupName)) return false;
    const metadata = this.repoMetadata() || {};
    const orders = { ...(metadata.orders || {}), [normalizedGroupName]: [] };
    this._saveNormalizedRepositoryState(this.repoList(), this.repoFavoriteList(), {
      ...metadata,
      groups: [...groups, normalizedGroupName],
      orders,
    });
    return true;
  }

  renameGroup(currentName, nextName) {
    if (!currentName || !nextName) return false;
    const normalizedNextName = nextName.trim();
    if (!normalizedNextName || normalizedNextName === currentName) return false;
    const metadata = this.repoMetadata() || {};
    const groups = this.getGroupsAlphabetical();
    if (!groups.includes(currentName) || groups.includes(normalizedNextName)) return false;
    const assignments = { ...(metadata.assignments || {}) };
    Object.keys(assignments).forEach((path) => {
      if (assignments[path] === currentName) {
        assignments[path] = normalizedNextName;
      }
    });
    const oldOrders = metadata.orders || {};
    const orders = {};
    Object.keys(oldOrders).forEach((groupKey) => {
      if (groupKey === currentName) {
        orders[normalizedNextName] = oldOrders[groupKey];
      } else {
        orders[groupKey] = oldOrders[groupKey];
      }
    });
    this._saveNormalizedRepositoryState(this.repoList(), this.repoFavoriteList(), {
      ...metadata,
      groups: groups.map((groupName) =>
        groupName === currentName ? normalizedNextName : groupName
      ),
      assignments,
      orders,
    });
    return true;
  }

  removeGroup(groupName) {
    const metadata = this.repoMetadata() || {};
    const groups = this.getGroupsAlphabetical();
    if (!groups.includes(groupName)) return false;

    const assignments = { ...(metadata.assignments || {}) };
    Object.keys(assignments).forEach((path) => {
      if (assignments[path] === groupName) {
        delete assignments[path];
      }
    });

    const orders = { ...(metadata.orders || {}) };
    delete orders[groupName];
    const repositories = this.repoList();
    orders[UNGROUPED_REPOSITORIES_KEY] = this._rebuildOrderForGroup(
      UNGROUPED_REPOSITORIES_KEY,
      repositories
    );

    this._saveNormalizedRepositoryState(repositories, this.repoFavoriteList(), {
      ...metadata,
      groups: groups.filter((group) => group !== groupName),
      assignments,
      orders,
    });
    return true;
  }

  setRepositoryGroup(path, groupName) {
    const repositories = this.repoList();
    if (!repositories.includes(path)) return false;
    const normalizedGroupName = typeof groupName === 'string' ? groupName.trim() : '';
    const metadata = this.repoMetadata() || {};
    const groups = this.getGroupsAlphabetical();
    if (normalizedGroupName && !groups.includes(normalizedGroupName)) {
      return false;
    }

    const assignments = { ...(metadata.assignments || {}) };
    const previousGroupKey = this._getRepositoryGroupKey(path);
    if (normalizedGroupName) {
      assignments[path] = normalizedGroupName;
    } else {
      delete assignments[path];
    }

    const targetGroupKey = normalizedGroupName || UNGROUPED_REPOSITORIES_KEY;
    const orders = { ...(metadata.orders || {}) };
    orders[previousGroupKey] = (orders[previousGroupKey] || []).filter((repoPath) => repoPath !== path);
    orders[targetGroupKey] = (orders[targetGroupKey] || []).filter((repoPath) => repoPath !== path);
    orders[targetGroupKey] = [...orders[targetGroupKey], path];

    this._saveNormalizedRepositoryState(repositories, this.repoFavoriteList(), {
      ...metadata,
      assignments,
      orders,
    });
    return true;
  }

  canMoveRepository(path, direction) {
    const groupKey = this._getRepositoryGroupKey(path);
    const metadata = this.repoMetadata() || {};
    const currentOrder = this._uniquePaths((metadata.orders || {})[groupKey] || []);
    const currentIndex = currentOrder.indexOf(path);
    if (currentIndex === -1) return false;
    const nextIndex = currentIndex + direction;
    return nextIndex >= 0 && nextIndex < currentOrder.length;
  }

  moveRepository(path, direction) {
    if (!this.canMoveRepository(path, direction)) return false;
    const groupKey = this._getRepositoryGroupKey(path);
    const metadata = this.repoMetadata() || {};
    const orders = { ...(metadata.orders || {}) };
    const currentOrder = this._uniquePaths(orders[groupKey] || []);
    const currentIndex = currentOrder.indexOf(path);
    const nextIndex = currentIndex + direction;
    [currentOrder[currentIndex], currentOrder[nextIndex]] = [
      currentOrder[nextIndex],
      currentOrder[currentIndex],
    ];
    orders[groupKey] = currentOrder;
    this._saveNormalizedRepositoryState(this.repoList(), this.repoFavoriteList(), {
      ...metadata,
      orders,
    });
    return true;
  }

  exportRepositoriesData() {
    return {
      version: REPOSITORIES_METADATA_VERSION,
      repositories: this.repoList(),
      favorites: this.repoFavoriteList(),
      metadata: this.repoMetadata(),
    };
  }

  importRepositoriesData(payload, mode) {
    const importMode = mode === 'replace' ? 'replace' : 'merge';
    const source = payload && typeof payload === 'object' ? payload : {};
    const sourceRepositories = this._uniquePaths(source.repositories || source.repoList || []);
    const sourceFavorites = this._uniquePaths(source.favorites || source.repoFavoriteList || []);
    const sourceMetadata = source.metadata || {};

    if (importMode === 'replace') {
      this._saveNormalizedRepositoryState(sourceRepositories, sourceFavorites, sourceMetadata);
      return;
    }

    const currentRepositories = this.repoList();
    const mergedRepositories = this._uniquePaths([...currentRepositories, ...sourceRepositories]);
    const currentFavorites = this.repoFavoriteList();
    const mergedFavorites = this._uniquePaths([...currentFavorites, ...sourceFavorites]);
    const currentMetadata = this.repoMetadata() || {};
    const mergedGroups = this._uniquePaths([
      ...(currentMetadata.groups || []),
      ...(sourceMetadata.groups || []),
    ]);
    const mergedAssignments = { ...(currentMetadata.assignments || {}) };
    const sourceAssignments = sourceMetadata.assignments || {};
    Object.keys(sourceAssignments).forEach((path) => {
      if (sourceRepositories.includes(path)) {
        mergedAssignments[path] = sourceAssignments[path];
      }
    });

    const mergedOrders = { ...(currentMetadata.orders || {}) };
    const sourceOrders = sourceMetadata.orders || {};
    Object.keys(sourceOrders).forEach((groupKey) => {
      if (!Array.isArray(sourceOrders[groupKey])) return;
      const normalizedPaths = this._uniquePaths(sourceOrders[groupKey]).filter((path) =>
        sourceRepositories.includes(path)
      );
      if (normalizedPaths.length === 0) return;
      const currentGroupOrder = this._uniquePaths(mergedOrders[groupKey] || []).filter((path) =>
        mergedRepositories.includes(path)
      );
      const remaining = currentGroupOrder.filter((path) => !normalizedPaths.includes(path));
      mergedOrders[groupKey] = [...normalizedPaths, ...remaining];
    });

    this._saveNormalizedRepositoryState(mergedRepositories, mergedFavorites, {
      version: REPOSITORIES_METADATA_VERSION,
      groups: mergedGroups,
      assignments: mergedAssignments,
      orders: mergedOrders,
    });
  }

  updateNode(parentElement) {
    ko.renderTemplate('app', this, {}, parentElement);
  }
  shown() {
    // The ungit.config constiable collections configuration from all different paths and only updates when
    // ungit is restarted
    if (!ungit.config.bugtracking) {
      // Whereas the userconfig only reflects what's in the ~/.ungitrc and updates directly,
      // but is only used for changing around the configuration. We need to check this here
      // since ungit may have crashed without the server crashing since we enabled bugtracking,
      // and we don't want to show the nagscreen twice in that case.
      this.server
        .getPromise('/userconfig')
        .then((userConfig) => this.bugtrackingEnabled(userConfig.bugtracking))
        .catch((e) => this.server.unhandledRejection(e));
    }

    this.server
      .getPromise('/latestversion')
      .then((version) => {
        if (!version) return;
        this.currentVersion(version.currentVersion);
        this.latestVersion(version.latestVersion);
        this.showNewVersionAvailable(!ungit.config.ungitVersionCheckOverride && version.outdated);
      })
      .catch((e) => this.server.unhandledRejection(e));
    this.server
      .getPromise('/gitversion')
      .then((gitversion) => {
        if (gitversion && !gitversion.satisfied) {
          this.gitVersionError(gitversion.error);
        }
      })
      .catch((e) => this.server.unhandledRejection(e));
  }
  updateAnimationFrame(deltaT) {
    if (this.content() && this.content().updateAnimationFrame)
      this.content().updateAnimationFrame(deltaT);
  }
  onProgramEvent(event) {
    if (event.event === 'request-credentials') {
      this._handleCredentialsRequested(event);
    } else if (event.event === 'request-remember-repo') {
      this._handleRequestRememberRepo(event);
    } else if (event.event === 'modal-show-dialog') {
      this.showModal(event.modal);
    } else if (event.event === 'modal-close-dialog') {
      $('.modal.fade').modal('hide');
      this.modal(undefined);
    }

    if (this.content() && this.content().onProgramEvent) {
      this.content().onProgramEvent(event);
    }
    if (this.header && this.header.onProgramEvent) {
      this.header.onProgramEvent(event);
    }
  }
  _handleRequestRememberRepo(event) {
    const repoPath = event.repoPath;
    if (this.repoList.indexOf(repoPath) != -1) return;
    this.addRepository(repoPath);
  }
  _handleCredentialsRequested(event) {
    // Only show one credentials dialog if we're asked to show another one while the first one is open
    // This happens for instance when we fetch nodes and remote tags at the same time
    if (!this._isShowingCredentialsDialog) {
      this._isShowingCredentialsDialog = true;
      components.showModal('credentialsmodal', { remote: event.remote });
    }
  }
  showModal(modal) {
    this.modal(modal);

    // when dom is ready, open the modal
    const checkExists = setInterval(() => {
      const modalDom = $('.modal.fade');
      if (modalDom.length) {
        clearInterval(checkExists);
        modalDom.modal();
        modalDom.on('hidden.bs.modal', function () {
          modal.close();
        });
      }
    }, 200);
  }
  gitSetUserConfig(bugTracking) {
    this.server.getPromise('/userconfig').then((userConfig) => {
      userConfig.bugtracking = bugTracking;
      return this.server.postPromise('/userconfig', userConfig).then(() => {
        this.bugtrackingEnabled(bugTracking);
      });
    });
  }
  enableBugtracking() {
    this.gitSetUserConfig(true);
  }
  dismissBugtrackingNagscreen() {
    storage.setItem('bugtrackingNagscreenDismissed', true);
    this.bugtrackingNagscreenDismissed(true);
  }
  dismissGitVersionError() {
    storage.setItem('gitVersionErrorDismissed', true);
    this.gitVersionErrorDismissed(true);
  }
  dismissNewVersion() {
    this.showNewVersionAvailable(false);
  }
  templateChooser(data) {
    if (!data) return '';
    return data.template;
  }
}
