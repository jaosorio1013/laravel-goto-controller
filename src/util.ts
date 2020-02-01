'use strict'

import {
    Uri,
    env,
    Range,
    commands,
    window,
    workspace,
    Selection,
    EventEmitter
} from 'vscode'

const escapeStringRegexp = require('escape-string-regexp')
export const clearAll = new EventEmitter()

/* Scroll ------------------------------------------------------------------- */
export function scrollToText() {
    window.registerUriHandler({
        handleUri(uri) {
            let { authority, path, query } = uri

            if (authority == 'ctf0.laravel-goto-controller') {
                commands.executeCommand('vscode.openFolder', Uri.file(path))
                    .then(() => {
                        setTimeout(() => {
                            let editor = window.activeTextEditor
                            let range = getTextPosition(query.replace('query=', ''), editor.document)

                            if (range) {
                                editor.selection = new Selection(range.start, range.end)
                                editor.revealRange(range, 2)
                            }
                        }, 100)
                    })
            }
        }
    })
}

function getTextPosition(searchFor, doc) {
    if (searchFor) {
        const regex = new RegExp(`function ${searchFor}`)
        const match = regex.exec(doc.getText())

        if (match) {
            let pos = doc.positionAt(match.index + match[0].length)

            return new Range(pos, pos)
        }
    }

    return null
}

/* Controllers ------------------------------------------------------------------ */
const fs = require("fs")
let classmap_fileContents = ''

export function getControllerFilePaths(text, document) {
    let workspaceFolder = workspace.getWorkspaceFolder(document.uri).uri.fsPath
    let editor = `${env.uriScheme}://file`

    let info = text.match(new RegExp(/['"](.*?)['"]/))[1]
    let controller = info
    let method = ''

    if (info.includes('@')) {
        let arr = info.split('@')
        controller = arr[0]
        method = arr[1]
    } else {
        let arr = info.split('\\')
        controller = arr.pop()
    }

    return getKeyLine(controller).map((path) => {
        return path
            ? {
                tooltip: path,
                fileUri: Uri
                    .parse(`${editor}${workspaceFolder}${path}?query=${method}`)
                    .with({ authority: 'ctf0.laravel-goto-controller' })
            }
            : false
    })
}

export async function listenToFileChanges(classmap_file, artisan_file, debounce) {
    await getFileContent(classmap_file)
    await getRoutesInfo(artisan_file)

    let watcher = workspace.createFileSystemWatcher(classmap_file_path)

    watcher.onDidChange(
        debounce(async function (e) {
            await getFileContent(classmap_file)
            await getRoutesInfo(artisan_file)
        }, 500)
    )
}

function getKeyLine(k) {
    let match = classmap_fileContents.match(new RegExp(`['"].*${escapeStringRegexp(k)}.*`, 'gm'))

    if (match) {
        let result = []

        for (const item of match) {
            let line = item
            let file: any = line.match(new RegExp(/['"]\S+(?=php).*?['"]/))

            if (file) {
                file = file[0].replace(/['"]/g, '')
                let path = line.includes('$baseDir')
                    ? file
                    : line.includes('$vendorDir')
                        ? `/vendor/${file}`
                        : null

                result.push(path.replace('//', '/'))
            }
        }

        return result
    }

    return null
}

function getFileContent(file) {
    return fs.readFile(file.path, 'utf8', (err, data) => {
        classmap_fileContents = data
    })
}

/* Routes ------------------------------------------------------------------- */
const exec = require('await-exec')
let routes_Contents = []
let APP_URL = ''

export function getRouteFilePath(text, document) {
    let info = extractController(text.replace(/['"]/g, ''))

    if (!info) {
        return []
    }

    let { uri: url, action, method: urlType } = info

    if (action == 'Closure') {
        return []
    }

    let workspaceFolder = workspace.getWorkspaceFolder(document.uri).uri.fsPath
    let editor = `${env.uriScheme}://file`
    let controller = ''
    let method = ''

    if (action.includes('@')) {
        let arr = action.split('@')
        method = arr[1]
        let namespace = arr[0].split('\\')
        controller = namespace.pop()
    } else {
        let arr = action.split('\\')
        controller = arr.pop()
    }

    let path = getKeyLine(controller)[0]

    if (!path) {
        return []
    }

    // controller
    let result = [{
        tooltip: action,
        fileUri: Uri
            .parse(`${editor}${workspaceFolder}${path}?query=${method}`)
            .with({ authority: 'ctf0.laravel-goto-controller' })
    }]

    // browser
    if (urlType.includes('GET') && APP_URL) {
        result.push({
            tooltip: url,
            fileUri: Uri.parse(`${APP_URL}/${url}`)
        })
    }

    return result
}

async function getRoutesInfo(file) {
    let res = await exec('php artisan route:list --columns=uri,name,action,method --json', {
        cwd: workspace.getWorkspaceFolder(file).uri.fsPath,
        shell: env.shell
    })

    routes_Contents = JSON.parse(res.stdout)
}

function extractController(k) {
    return routes_Contents.find((e) => e.name == k)
}

export async function saveAppURL() {
    APP_URL = await window.showInputBox({
        placeHolder: 'project APP_URL',
        value: await env.clipboard.readText() || '',
        validateInput(v) {
            if (!v) {
                return 'you have to add a name'
            } else {
                return ''
            }
        }
    })

    if (APP_URL) {
        clearAll.fire()
    }
}

/* Config ------------------------------------------------------------------- */
export let classmap_file_path

export function readConfig() {
    classmap_file_path = workspace.getConfiguration('laravel_goto_controller').classmapfile
}