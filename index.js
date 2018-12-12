'use strict';

const alfy = require('alfy');
const alfredNotifier = require('alfred-notifier');

const Promise = require('bluebird')
const which = require('which');
const whichAsync = (app) => new Promise((resolve, reject) => {
    which(app, (err, path) => {
        if (!!err) {
            reject(err);
        } else {
            resolve(path);
        }
    })
})

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const readFile = Promise.promisify(fs.readFile);

const xml2js = require('xml2js');
const xmlParser = Promise.promisify(new xml2js.Parser().parseString);

const userHome = require('user-home') || '';

// Checks for available update and updates the `info.plist`
alfredNotifier();

const path_recent_projects = '/options/recentProjects.xml';

let readConfig = async (app) => {
    let prjConfig = alfy.cache.get('IDEA_PRJ');

    if (!!prjConfig) {
        return prjConfig;
    }

    // jetbrains执行路径（一般为Python脚本）
    const appPath = await whichAsync(app).catch(ex => null);
    if (null == appPath) {
        alfy.output([{
            title: `找不到 ${app} Command-line Launcher`,
            subtitle: `请在 ${app} 中执行 Tool -> Create Command-line Launcher...`,
            icon: {
                path: './icon/error.png'
            }
        }]);

        return null;
    }

    const rl = readline.createInterface({
        input: fs.createReadStream(appPath)
    })

    // jetbrains配置路径
    const configPath = await new Promise((resolve, reject) => {
        // 查找 CONFIG_PAYH = u''
        let _configPath = null;
        rl.on('line', (line) => {
            if (line.trim().startsWith('CONFIG_PATH')) {
                _configPath = line.substring(line.lastIndexOf('u\'') + 2, line.lastIndexOf('\''));
            }
        }).on('close', () => {
            if (!!_configPath) {
                resolve(path.join(_configPath, path_recent_projects));
            } else {
                reject('找不到 CONFIG_PATH');
            }
        });
    }).catch(ex => null);

    if (null == configPath) {
        alfy.output([{
            title: `找不到 CONFIG_PATH`,
            subtitle: `请确保 ${appPath} 中已定义 CONFIG_PATH 变量`,
            icon: {
                path: './icon/error.png'
            }
        }]);

        return null;
    }

    // 读取配置文件
    const configXml = await readFile(configPath).catch((ex) => null);
    if (null == configXml) {
        alfy.output([{
            title: `配置文件内容为空`,
            subtitle: configPath,
            icon: {
                path: './icon/error.png'
            }
        }]);

        return null;
    }

    // 解析配置文件
    const configContent = await xmlParser(configXml).catch((ex) => null);
    if (null == configXml) {
        alfy.output([{
            title: `无法解析配置文件`,
            subtitle: configPath,
            icon: {
                path: './icon/error.png'
            }
        }]);

        return null;
    }

    const components = (configContent.application || {}).component || []
    let recentProjectsManager = {};
    for (let component of components) {
        if (component.$.name == 'RecentProjectsManager') {
            recentProjectsManager = component;
            break;
        }
    }

    // 抽取openPrjs
    let openPrjs = new Set();
    for (let option of recentProjectsManager.option) {
        if (option.$.name == 'openPaths') {
            option.list[0].option.forEach(opt => {
                let path = opt.$.value.replace('$USER_HOME$', userHome);
                if (path.endsWith('/')) {
                    path = path.substring(0, path.length - 1);
                }
                openPrjs.add(path)
            });
            break;
        }
    }

    // 抽取recentPrjs
    let recentPrjs = [];
    for (let option of recentProjectsManager.option) {
        if (option.$.name == 'recentPaths') {
            recentPrjs = option.list[0].option.map(opt => {
                let path = opt.$.value.replace('$USER_HOME$', userHome)
                if (path.endsWith('/')) {
                    path = path.substring(0, path.length - 1);
                }
                // FIXME 从idea配置中获取工程名
                let name = path.substr(path.lastIndexOf('/') + 1);
                return { name, path, opened: openPrjs.has(path) };
            });
            break;
        }
    }

    prjConfig = { appPath, configPath, recentPrjs };
    alfy.cache.set('IDEA_PRJ', prjConfig, { maxAge: 60 * 1000 });
    return prjConfig;
}

(async () => {
    const app = process.argv[2];
    const proj = (process.argv[3] || '').toLowerCase();

    const config = await readConfig(app);

    if (!config) {
        return;
    }

    const items = config.recentPrjs
        .filter(prj => prj.name.toLowerCase().includes(proj))
        .map(prj => {
            return {
                title: prj.name,
                autocomplete: prj.name,
                subtitle: prj.path,
                arg: JSON.stringify({ appPath: config.appPath, prjPath: prj.path, prjName: prj.name }),
                icon: {
                    path: prj.opened ? './icon/running.png' : 'icon.png'
                }
            };
        });

    alfy.output(items);
})();