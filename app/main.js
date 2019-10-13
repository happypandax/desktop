const { app, BrowserWindow } = require('electron')
const path = require('path')

function create_window () {
    let win = new BrowserWindow({
      title: "HappyPanda X Desktop",
      icon: "static/favicon/favicon.ico",
      width: 1024,
      height: 800,
      minWidth: 500,
      minHeight: 500,
      webPreferences: {
        preload: path.join(__dirname, 'pre.js'),
        nodeIntegration: true
      },
      backgroundColor: '#f9f9f9',
      show: false
    })
  
    win.loadFile('templates/index.html')

    win.webContents.openDevTools()

    win.on('closed', () => {
        win = null
      })

    win.once('ready-to-show', () => {
    win.show()
    })
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
