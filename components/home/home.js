const ko = require('knockout');
const octicons = require('octicons');
const components = require('ungit-components');
const { encodePath } = require('ungit-address-parser');

components.register('home', (args) => new HomeViewModel(args.app));

const TYPES_SORT = {
  project: 'project',
  path: 'path'
};

const TYPES_VIEW = {
  list: 'List',
  block: 'Block'
};

class HomeRepositoryViewModel {
  constructor(home, path) {
    this.home = home;
    this.app = home.app;
    this.server = this.app.server;
    this.path = path;
    this.title = path;
    this.projectname = path.split("/").pop();
    this.link = `${ungit.config.rootPath}/#/repository?path=${encodePath(path)}`;
    this.pathRemoved = ko.observable(false);
    this.remote = ko.observable('...');
    this.updateState();
    this.removeIcon = octicons['x-circle'].toSVG({ height: 18 });
    this.arrowIcon = octicons['file-directory-open-fill'].toSVG({ height: 24 });
    this.starEmptyIcon = octicons['star'].toSVG({ height: 24 });
    this.starFillIcon = octicons['star-fill'].toSVG({ height: 24 });
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
    this.app.repoList.remove(this.path);
    this.home.update();
  }

  favorite() {
    if (this.app.repoFavoriteList.indexOf(this.path) == -1) {
      this.app.repoFavoriteList.push(this.path);
    } else {
      this.app.repoFavoriteList.remove(this.path);
    }
    this.home.update();
  }

  isFavorite() {
    return this.app.repoFavoriteList.indexOf(this.path) > -1;
  }

  isListView() {
    return this.home.typeViewSelected() == TYPES_VIEW.list;
  }
}

class HomeViewModel {
  constructor(app) {
    this.app = app;
    this.repos = ko.observableArray();
    this.reposFavorites = ko.observableArray();
    this.showNux = ko.computed(() => this.repos().length == 0);
    this.showNuxFavorites = ko.computed(() => this.reposFavorites().length == 0);
    this.addIcon = octicons.plus.toSVG({ height: 18 });
    this.typeViews = Object.values(TYPES_VIEW);
    this.typeViewSelected = ko.observable(TYPES_VIEW.block);
    this.viewBlockIcon = octicons['apps'].toSVG({ height: 24 });
    this.viewListIcon = octicons['list-unordered'].toSVG({ height: 24 });
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

  customSort(list, type) {
    const getProjectName = path => path.split("/").pop();

    // sort by project name
    if (type == TYPES_SORT.project) {
      list.sort((a, b) => getProjectName(a).localeCompare(getProjectName(b)));
    } else {
      list.sort();
    }

    return list;
  }

  update() {
    const reposByPath = {}, reposByPathFavorites = {};
    
    const favorites = this.app.repoFavoriteList();
    const reps = this.app.repoList();
    const noFavorites = reps.filter(repo => !favorites.includes(repo));

    const typeSort = TYPES_SORT.project;

    this.repos().forEach((repo) => {
      if (favorites && favorites.length > 0 && favorites.includes(repo.path)) {
        reposByPathFavorites[repo.path] = repo;
      } else {
        reposByPath[repo.path] = repo;
      }
    });

    this.reposFavorites(
      this.customSort(favorites, typeSort)
        .map((path) => {
          if (!reposByPathFavorites[path]) reposByPathFavorites[path] = new HomeRepositoryViewModel(this, path);
          return reposByPathFavorites[path];
        })
    );

    this.repos(
      this.customSort(noFavorites, typeSort)
        .map((path) => {
          if (!reposByPath[path]) reposByPath[path] = new HomeRepositoryViewModel(this, path);
          return reposByPath[path];
        })
    );
    
  }
  get template() {
    return 'home';
  }
}
