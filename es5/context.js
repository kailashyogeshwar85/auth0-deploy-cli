'use strict';

Object.defineProperty(exports, "__esModule", {
    value: true
});

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _bluebird = require('bluebird');

var _bluebird2 = _interopRequireDefault(_bluebird);

var _fs = require('fs');

var fs = _interopRequireWildcard(_fs);

var _path = require('path');

var path = _interopRequireWildcard(_path);

var _logger = require('./logger');

var _logger2 = _interopRequireDefault(_logger);

var _auth0SourceControlExtensionTools = require('auth0-source-control-extension-tools');

function _interopRequireWildcard(obj) { if (obj && obj.__esModule) { return obj; } else { var newObj = {}; if (obj != null) { for (var key in obj) { if (Object.prototype.hasOwnProperty.call(obj, key)) newObj[key] = obj[key]; } } newObj.default = obj; return newObj; } }

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

_bluebird2.default.promisifyAll(fs);

var isPage = function isPage(file) {
    var directory = path.basename(path.dirname(file));
    _logger2.default.debug("checking if " + directory + ", " + file + " matches " + _auth0SourceControlExtensionTools.constants.PAGES_DIRECTORY + ", and " + _auth0SourceControlExtensionTools.constants.PAGE_NAMES);
    var dirIndex = file.indexOf(_auth0SourceControlExtensionTools.constants.PAGES_DIRECTORY + '/');
    var nameIndex = _auth0SourceControlExtensionTools.constants.PAGE_NAMES.indexOf(file.split('/').pop());
    _logger2.default.debug("dirIndex: " + dirIndex + ", nameIndex: " + nameIndex);
    return directory === _auth0SourceControlExtensionTools.constants.PAGES_DIRECTORY && nameIndex >= 0;
};

/*
 * Download a single rule with its metadata.
 */
var processRule = function processRule(ruleName, rule) {
    var currentRule = {
        script: false,
        metadata: false,
        name: ruleName
    };

    var fileProcesses = [];

    if (rule.script) {
        fileProcesses.push(fs.readFileAsync(rule.scriptFileName, 'utf8').then(function (contents) {
            currentRule.script = true;
            currentRule.scriptFile = contents;
        }));
    }

    if (rule.metadata) {
        fileProcesses.push(fs.readFileAsync(rule.metadataFileName, 'utf8').then(function (contents) {
            currentRule.metadata = true;
            currentRule.metadataFile = contents;
        }));
    }

    return new _bluebird2.default.all(fileProcesses).then(function () {
        return currentRule;
    });
};

/*
 * Determine if we have the script, the metadata or both.
 */
var getRules = function getRules(dirPath) {
    // Rules object.
    var rules = {};
    var files = [];

    try {
        fs.accessSync(dirPath, fs.F_OK);
        // file  exists, also make sure it is a directory
        if (fs.lstatSync(dirPath).isDirectory()) {
            _logger2.default.debug("Looking for rules in " + dirPath);
            /* Grab the files and loop through them */
            files.push(fs.readdirAsync(dirPath).then(function (files) {
                files.forEach(function (fileName) {
                    /* Process File */
                    var ruleName = path.parse(fileName).name;
                    var ext = path.parse(fileName).ext;
                    rules[ruleName] = rules[ruleName] || {};

                    if (ext === '.js') {
                        rules[ruleName].script = true;
                        rules[ruleName].scriptFileName = path.join(dirPath, fileName);
                    } else if (ext === '.json') {
                        rules[ruleName].metadata = true;
                        rules[ruleName].metadataFileName = path.join(dirPath, fileName);
                    }
                });
            }).catch(function (e) {
                _logger2.default.error("Couldn't process " + dirPath + " because: ");
                _logger2.default.error(e);
            }));
        }
    } catch (e) {
        /* Rules must not exist.
         * TODO should probably check for NOENT here instead of just failing silently
         */
        _logger2.default.debug(dirPath + " does not exist, no rules found!");
        _logger2.default.debug(e);
    }

    // Download all rules.
    return _bluebird2.default.all(files).then(function () {
        return _bluebird2.default.map(Object.keys(rules), function (ruleName) {
            return processRule(ruleName, rules[ruleName]);
        }, { concurrency: 2 });
    });
};

/*
 * Process a single page script.
 */
var processPage = function processPage(pageName, page) {
    var fileProcesses = [];
    var currentPage = {
        metadata: false,
        name: pageName
    };

    if (page.fileName) {
        fileProcesses.push(fs.readFileAsync(page.fileName, 'utf8').then(function (contents) {
            currentPage.htmlFile = contents;
        }));
    }

    if (page.metaFileName) {
        fileProcesses.push(fs.readFileAsync(page.metaFileName, 'utf8').then(function (contents) {
            currentPage.metadata = true;
            currentPage.metadataFile = contents;
        }));
    }

    return _bluebird2.default.all(fileProcesses).then(function () {
        return currentPage;
    });
};

/*
 * Get all pages.
 */
var getPages = function getPages(dirPath) {
    var pages = {};
    var files = [];

    try {
        fs.accessSync(dirPath, fs.F_OK);
        // file  exists, also make sure it is a directory
        if (fs.lstatSync(dirPath).isDirectory()) {
            /* Grab the files and loop through them */
            files.push(fs.readdirAsync(dirPath).then(function (files) {
                files.forEach(function (fileName) {
                    /* Process File */
                    var fullFileName = path.join(dirPath, fileName);
                    if (isPage(fullFileName)) {
                        var pageName = path.parse(fileName).name;
                        var ext = path.parse(fileName).ext;
                        pages[pageName] = pages[pageName] || {};

                        if (ext !== '.json') {
                            pages[pageName].fileName = fullFileName;
                        } else {
                            pages[pageName].metaFileName = fullFileName;
                        }
                    } else {
                        _logger2.default.warn("Skipping file that is not a page: " + fullFileName);
                    }
                });
            }).catch(function (e) {
                _logger2.default.error("Couldn't process directory," + dirPath + " , because: " + JSON.stringify(e));
            }));
        } else {
            _logger2.default.error("Can't process pages file that is not a directory: " + dirPath);
        }
    } catch (e) {
        /* Pages must not exist.
         * TODO should probably check for NOENT here instead of just failing silently
         */
        _logger2.default.debug("Processing pages: " + JSON.stringify(e));
    }

    return _bluebird2.default.all(files).then(function () {
        return _bluebird2.default.map(Object.keys(pages), function (pageName) {
            return processPage(pageName, pages[pageName]);
        }, { concurrency: 2 });
    });
};

var getChanges = function getChanges(filePath) {
    var fullPath = path.resolve(filePath);
    var lstat = fs.lstatSync(fullPath);
    if (lstat.isDirectory()) {
        /* If this is a directory, look for each file in the directory */
        _logger2.default.debug("Processing " + filePath + " as directory " + fullPath);

        var promises = {
            rules: getRules(path.join(fullPath, "rules")),
            pages: getPages(path.join(fullPath, "pages"))
        };

        return _bluebird2.default.props(promises).then(function (result) {
            return {
                rules: (0, _auth0SourceControlExtensionTools.unifyScripts)(result.rules),
                //databases: unifyDatabases(result.databases),
                pages: (0, _auth0SourceControlExtensionTools.unifyScripts)(result.pages)
            };
        });
    } else if (lstat.isFile()) {
        /* If it is a file, parse it */
        return JSON.parse(fs.readFileSync(fullPath));
    } else {
        throw new Error("Not sure what to do with, " + fullPath + ", it is not a file or directory...");
    }
};

var _class = function () {
    function _class(fileName) {
        _classCallCheck(this, _class);

        this.fileName = fileName;
    }

    _createClass(_class, [{
        key: 'init',
        value: function init() {
            var me = this;
            /* First parse the input file */
            return getChanges(me.fileName).then(
            /* Map just the data that is in the config file */
            function (data) {
                me.pages = data.pages || {};
                me.rules = data.rules || {};
                me.databases = data.databases || [];
            });
        }
    }]);

    return _class;
}();

exports.default = _class;