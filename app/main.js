nw.Window.open(
    'templates/index.html',
    {
        "id": "happypandax_desktop_main",
        "title": "HappyPanda X Desktop",
        "width": 1024,
        "height": 800,
        "icon": "static/favicon/favicon.ico",
        "min_width": 500,
        "min_height": 500,
        'inject_js_start': 'app/start.js'
    },
    function (win) {

        win.on('close', function () {
            this.hide()
            this.close(true)
        });

        global.contextmenu = new nw.Menu();
        global.contextmenu.createMacBuiltin("HappyPanda X Desktop");
        global.contextmenu.append(new nw.MenuItem({ label: 'Quit' }));

        //win.window.document.body.addEventListener('contextmenu', function (ev) {
        //    ev.preventDefault();
        //    global.contextmenu.popup(ev.x, ev.y);
        //    return false;
        //});

    });
