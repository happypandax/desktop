var __OS__ = require('os');

global.SERVER = {
    HOST: 'localhost',
    PORT: 7007
}
global.CONFIG_PATH = require('path').join(process.cwd(), 'desktop.json')

var SERVER_SSL = false;
var SERVER_HOST = global.SERVER.HOST;
var SERVER_PORT = global.SERVER.PORT;
var WEBSERVER_HOST = 'localhost';
var WEBSERVER_PORT = 7008;
var SERVER_URL = (SERVER_SSL ? 'https://' : 'http://') + SERVER_HOST + ':' + SERVER_PORT.toString();
var WEBSERVER_URL = (SERVER_SSL ? 'https://' : 'http://') + WEBSERVER_HOST + ':' + WEBSERVER_PORT.toString();
var SOCKETIO_MODULE = require('../app/socket-io-client');
var VERSION = "0.1.1";
var TITLE = "HPX Desktop - Alpha";

function IS_SAME_MACHINE(host) {
    let same = false;
    let ifaces = __OS__.networkInterfaces();

    Object.keys(ifaces).forEach(function (ifname) {
        ifaces[ifname].forEach(function (iface) {
            if (iface.address === host)
                same = true;
        });
    });
    return same;
}

class _DESKTOP_API {

    constructor() {
        this.context_menu = this.create_context_menu()
    }

    show_context_menu(ev) {
        if (this.context_menu) {
            this.context_menu.popup(ev.x, ev.y);
            return false
        }
    }

    create_context_menu() {
        let menu = new nw.Menu();
        menu.append(new nw.MenuItem({ label: 'Quit' }))
        return menu
    }

}

const DESKTOP_API = new _DESKTOP_API()
