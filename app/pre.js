var __OS__ = require('os');

const context = require('electron-contextmenu-middleware');
const input = require('electron-input-menu');
const debug = require('debug-menu').middleware;

context.use(input);
if (process.env.NODE_ENV == 'development') {
    context.use(debug);
}
context.activate();

global.SERVER = {
    HOST: 'localhost',
    PORT: 7007
}
global.CONFIG_PATH = require('path').join(process.cwd(), 'desktop.json')

global.SERVER_SSL = false;
global.SERVER_HOST = global.SERVER.HOST;
global.SERVER_PORT = global.SERVER.PORT;
global.WEBSERVER_HOST = 'localhost';
global.WEBSERVER_PORT = 7008;
global.SERVER_URL = (global.SERVER_SSL ? 'https://' : 'http://') + global.SERVER_HOST + ':' + global.SERVER_PORT.toString();
global.WEBSERVER_URL = (global.SERVER_SSL ? 'https://' : 'http://') + global.WEBSERVER_HOST + ':' + global.WEBSERVER_PORT.toString();
global.SOCKETIO_MODULE = require('./socket-io-client');
global.VERSION = require('../package.json').version;
global.TITLE = "HPX Desktop - Alpha";

global.IS_SAME_MACHINE = function(host) {
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
    }

    show_context_menu(ev) {
    }

}

global.DESKTOP_API = new _DESKTOP_API()
