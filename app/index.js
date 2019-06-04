const client = require('../app/client');
const fs = require('fs');
const path = require('path');
const child_process = require('child_process');

const HPX_HTML = "../templates/hpx.html"

let client_obj = null
let options = {
    server_host: 'localhost',
    server_port: 7007,
    start_host: 'localhost',
    start_port: 7007,
    start_webhost: 'localhost',
    start_webport: 7008
}

function main() {

    if (fs.existsSync(global.CONFIG_PATH)) {
        let data = fs.readFileSync(global.CONFIG_PATH, 'utf8')
        options = updateObject(options, JSON.parse(data))
        if (options.default !== undefined) {
            switch (options.default) {
                case 'start':
                    document.getElementsByName('default-start')[0].checked = true
                    break;
                case 'connect':
                    document.getElementsByName('default-connect')[0].checked = true
                    break;
            }
        }

        if (options.executable !== undefined) {
            document.getElementsByName('executable')[0].value = options.executable
        }

        if (options.server_host !== undefined) {
            document.getElementsByName('server-host')[0].value = options.server_host
        }

        if (options.server_port !== undefined) {
            document.getElementsByName('server-port')[0].value = options.server_port
        }

        if (options.start_host !== undefined) {
            document.getElementsByName('start-host')[0].value = options.start_host
        }

        if (options.start_port !== undefined) {
            document.getElementsByName('start-port')[0].value = options.start_port
        }

        if (options.start_webhost !== undefined) {
            document.getElementsByName('start-webhost')[0].value = options.start_webhost
        }

        if (options.start_webport !== undefined) {
            document.getElementsByName('start-webport')[0].value = options.start_webport
        }
    }

    // Got here using the browser "Back" or "Forward" button
    if (window.performance && window.performance.navigation.type == window.performance.navigation.TYPE_BACK_FORWARD) {
        options.default = undefined
    }

    for (const item of document.querySelectorAll('.accordion')) {
        addEvent(item.querySelector('.title'), 'click', () => { item.querySelector('.title').classList.toggle("active")})
        addEvent(item.querySelector('.title'), 'click', () => { item.querySelector('.content').classList.toggle("active")})
    }

    switch (options.default) {
        case 'start':
            console.log("auto-start")
            on_start_hpx()
            break;
        case 'connect':
            console.log("auto-connect")
            on_connect_hpx()
            break;
    }

}

async function check_connection(params) {
    if (!client_obj)
        client_obj = new client.Client()
    client_obj.set_server([params.server_host, params.server_port])
    try {
        return await client_obj.connect()
    } catch (e) {
        console.error(e)
    }
    return false;
}

function update_options(opt, sync) {
    switch (opt.default) {
        case 'start':
            document.getElementsByName('default-connect')[0].checked = false
            break;
        case 'connect':
            document.getElementsByName('default-start')[0].checked = false
            break;
    }
    updateObject(options, opt)
    if (sync)
        fs.writeFileSync(global.CONFIG_PATH, JSON.stringify(options), 'utf8')
    else
        fs.writeFile(global.CONFIG_PATH, JSON.stringify(options), 'utf8', () => { })
}

function on_default_option(el) {
    let opt = { default : '' }
    if (el.name == 'default-connect' && el.checked)
        opt.default = 'connect'
    else if (el.name == 'default-start' && el.checked)
        opt.default = 'start'
    update_options(opt)
}

function open_dialog_by_name(selector) {
    document.getElementsByName(selector)[0].click()
}

function on_executable_option(el) {
    opt = { executable: el.value }
    update_options(opt)
}

function on_executable_select(el) {
    i = document.getElementsByName('executable')[0]
    i.value = el.value
    on_executable_option(i)
}

function on_start_server_option(el) {
    if (el.name == 'start-host')
        opt = { start_host: el.value || 'localhost' }
    else if (el.name == 'start-port')
        opt = { start_port: el.value || 7007 }
    else if (el.name == 'start-webhost')
        opt = { start_webhost: el.value || 'localhost' }
    else if (el.name == 'start-webport')
        opt = { start_webport: el.value || 7008 }
    update_options(opt)
}


function on_server_option(el) {
    if (el.name == 'server-host')
        opt = { server_host: el.value || 'localhost' }
    else if (el.name == 'server-port')
        opt = { server_port : el.value || 7007}
    update_options(opt)
}

function enter_hpx() {
    fs.writeFileSync(global.CONFIG_PATH, JSON.stringify(options), 'utf8')
    window.location.href = HPX_HTML
}

function on_start_hpx(ev) {
    if (ev)
        ev.preventDefault()
    if (!options.executable) {
        let t = document.querySelector('#start-options').querySelector('.title')
        if (!t.classList.contains('active'))
            t.click()
        document.querySelector('input[name="executable"]').focus()
        return
    }
    let failed = false;
    let fail = () => {
        failed = true;
        document.querySelector('#segment-loader').classList.toggle("active")
        document.querySelector('#start-form').classList.toggle("error")
    }
    document.querySelector('#segment-loader').classList.toggle("active")
    document.querySelector('#segment-loader-text').innerHTML = "Starting HPX server"
    let p = path.parse(options.executable)
    if (fs.existsSync(options.executable) && p.name === 'happypandax') {
        let c_host = options.start_host
        let c_port = options.start_port
        process.env['PYTHONUNBUFFERED'] = '1'
        global.hpx_process = child_process.spawn(options.executable,
            ['--host', c_host, '--port', c_port, '--web-host', options.start_webhost, '--web-port', options.start_webport],
            { env:process.env})

        global.hpx_process.on('exit', code => {
            fail()
            console.error(`HPX server exited with code: ${code}`)
        })

        global.hpx_process.on('error', error => {
            fail()
            console.error(`HPX server startup error: ${error}`)
        })

        global.hpx_process.stdout.on('data', data => {
            if (data.indexOf('Starting server...') !== -1)
                enter_hpx()
            console.log(`STDOUT: ${data}`);
        })

        global.hpx_process.stderr.on('data', data => {
            if (data.indexOf('OSError:') !== -1) {
                global.hpx_process.kill()
            }
            console.log(`STDERR: ${data}`);
        })
        updateObject(options, { c_server_host: c_host, c_server_port: c_port })
        setTimeout(() => {!failed ? enter_hpx() : null }, 7000)
    }
    else {
        fail()
    }
}

async function on_connect_hpx(ev) {
    if (ev)
        ev.preventDefault()
    document.querySelector('#segment-loader').classList.toggle("active")
    document.querySelector('#segment-loader-text').innerHTML = "Connecting to existing HPX server"
    let s = await check_connection(options)
    if (s) {
        updateObject(options, { c_server_host: options.server_host, c_server_port: options.server_port })
        enter_hpx()
    }
    else {
        document.querySelector('#segment-loader').classList.toggle("active")
        document.querySelector('#connect-form').classList.toggle("error")
    }
}

function set_innerhtml(el, value) {
    if (!el.innerHTML)
        el.innerHTML = value;
}

function updateObject(obj/*, …*/) {
    for (var i=1; i<arguments.length; i++) {
        for (var prop in arguments[i]) {
            var val = arguments[i][prop];
            if (typeof val == "object") // this also applies to arrays or null!
                updateObject(obj[prop], val);
            else
                obj[prop] = val;
        }
    }
    return obj;
}

function serializeArray(form) {
    var field, l, s = [];
    if (typeof form == 'object' && form.nodeName == "FORM") {
        var len = form.elements.length;
        for (var i=0; i<len; i++) {
            field = form.elements[i];
            if (field.name && !field.disabled && field.type != 'file' && field.type != 'reset' && field.type != 'submit' && field.type != 'button') {
                if (field.type == 'select-multiple') {
                    l = form.elements[i].options.length; 
                    for (j=0; j<l; j++) {
                        if(field.options[j].selected)
                            s[s.length] = { name: field.name, value: field.options[j].value };
                    }
                } else if ((field.type != 'checkbox' && field.type != 'radio') || field.checked) {
                    s[s.length] = { name: field.name, value: field.value };
                }
            }
        }
    }
    return s;
}

function postAjax(url, data, success) {
    var params = typeof data == 'string' ? data : Object.keys(data).map(
            function(k){ return encodeURIComponent(k) + '=' + encodeURIComponent(data[k]) }
        ).join('&');

    var xhr = window.XMLHttpRequest ? new XMLHttpRequest() : new ActiveXObject("Microsoft.XMLHTTP");
    xhr.open('POST', url);
    xhr.onreadystatechange = function() {
        if (xhr.readyState>3 && xhr.status==200) { success(xhr.responseText); }
    };
    xhr.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
    xhr.setRequestHeader('Content-Type', 'application/json');
    xhr.send(params);
    return xhr;
}

function addEvent(el, type, handler) {
    if (el.attachEvent) el.attachEvent('on'+type, handler); else el.addEventListener(type, handler);
}
function removeEvent(el, type, handler) {
    if (el.detachEvent) el.detachEvent('on'+type, handler); else el.removeEventListener(type, handler);
}

// in case the document is already rendered
if (document.readyState!='loading') main();
// modern browsers
else if (document.addEventListener) document.addEventListener('DOMContentLoaded', main);
// IE <= 8
else document.attachEvent('onreadystatechange', function(){
    if (document.readyState=='complete') main();
});