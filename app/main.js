const { app, BrowserWindow, shell } = require('electron')
const path = require('path')
const { autoUpdater } = require("electron-updater")
const windowStateKeeper = require('electron-window-state');

process.env['NODE_ENV'] = app.isPackaged ? 'production' : 'development'
app.setAppUserModelId("com.happypandax.desktop")

function create_window () {

    let mainWindowState = windowStateKeeper({
      defaultWidth: 1024,
      defaultHeight: 800
    });

    let win = new BrowserWindow({
      title: "HappyPanda X Desktop",
      icon: "static/favicon/favicon.ico",
      x: mainWindowState.x,
      y: mainWindowState.y,
      width: mainWindowState.width,
      height: mainWindowState.height,
      minWidth: 500,
      minHeight: 500,
      webPreferences: {
        preload: path.join(__dirname, 'pre.js'),
        nodeIntegration: true
      },
      backgroundColor: '#f9f9f9',
      show: false
    })

    if (process.env.NODE_ENV == 'production') {
      win.setMenu(null)
    } else {
      win.webContents.openDevTools()
    }
    
    win.webContents.on('new-window', function(e, url) {
        e.preventDefault();
        shell.openExternal(url);
      });
  
    win.loadFile('templates/index.html')

    win.on('closed', () => {
        win = null
      })

    win.once('ready-to-show', () => {
    win.show()
    })

    autoUpdater.checkForUpdatesAndNotify()
    mainWindowState.manage(win);
  }
  
app.on('ready', create_window)

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit()
    }
})

app.on('activate', () => {
    if (win === null) {
        create_window()
    }
})
  

// nw.Window.open(
//     'templates/index.html',
//     {
//         "id": "happypandax_desktop_main",
//         "title": "HappyPanda X Desktop",
//         "width": 1024,
//         "height": 800,
//         "icon": "static/favicon/favicon.ico",
//         "min_width": 500,
//         "min_height": 500,
//         'inject_js_start': 'app/start.js',
//     },
//     function (win) {

//         win.on('close', function () {
//             this.hide()
//             this.close(true)
//         });

//         // global.contextmenu = new nw.Menu();
//         // global.contextmenu.createMacBuiltin("HappyPanda X Desktop");
//         // global.contextmenu.append(new nw.MenuItem({ label: 'Quit' }));

//         // win.window.document.body.addEventListener('contextmenu', function (ev) {
//         //    ev.preventDefault();
//         //    global.contextmenu.popup(ev.x, ev.y);
//         //    return false;
//         // });

//     });
