const net = require('net');
const zlib = require('zlib');
const { Transform } = require('stream');
const log = require('./log');
const Promise = require('./bluebird');
const fs = require('fs');

process.on('unhandledRejection', (reason, promise) => {
    console.log('Unhandled Rejection:')
    console.log(reason)
    console.log('Unhandled Rejection at:', reason.stack || reason)
    // Recommended: send the information to sentry.io
    // or whatever crash reporting service you use
})

Promise.longStackTraces();

const encoding = "utf8"

const postfix = Buffer.from("<EOF>", encoding)

const exception_codes = {
    'AuthRequiredError': 407,
    'AuthWrongCredentialsError': 411,
    'AuthMissingCredentials': 412,
    'ServerError': 400,
    'AuthError': 406,
    'ClientError': 500,
    'ConnectionError': 501,
    'ServerDisconnectError': 502,
}

class EError extends Error {
    constructor(message) {
        super(message);
        this.name = this.constructor.name;
        if (typeof Error.captureStackTrace === 'function') {
            Error.captureStackTrace(this, this.constructor);
        } else {
            this.stack = (new Error(message)).stack;
        }
        this.code = exception_codes[this.name];
    }
} 

class ServerError extends EError { }
exports.ServerError = ServerError
class AuthError extends ServerError {}
exports.AuthError = AuthError
class AuthWrongCredentialsError extends AuthError {}
exports.AuthWrongCredentialsError = AuthWrongCredentialsError
class AuthRequiredError extends AuthError {}
exports.AuthRequiredError = AuthRequiredError
class AuthMissingCredentials extends AuthError {}
exports.AuthMissingCredentials = AuthMissingCredentials
class ClientError extends ServerError {}
exports.ClientError = ClientError
class ConnectionError extends ClientError {}
exports.ConnectionError = ConnectionError
class ServerDisconnectError extends ConnectionError {}
exports.ServerDisconnectError = ServerDisconnectError

function finalize(msg_dict, session_id, name, error, opts) {
    session_id = session_id || ""
    if (opts === undefined)
        opts = {} 
    if (name === undefined)
        name = null 
    if (error === undefined)
        error = null 
    let to_json = opts.to_json
    if (opts.to_json === undefined)
        to_json = false
    let to_bytes = opts.to_bytes
    if (opts.to_bytes === undefined)
        to_bytes = false
    if (opts.to_bytes === true)
        to_json = true

    let msg = {
        'session': session_id,
        'name': name ? name : "hpx-desktop",
        'data': msg_dict,
    }

    if (error)
        msg['error'] = error

    rmsg = msg

    if (to_json)
        rmsg = JSON.stringify(rmsg)

    if (to_bytes)
        rmsg = Buffer.from(rmsg, encoding)

    return rmsg
}

class HPXTransform extends Transform {
    constructor(client_name, options) {
        super(options);
        this._buffer = Buffer.from("", encoding)
        this._client_name = client_name
    }

    _end_of_msg(buffer) {

        let chunk = buffer
        let idx = buffer.indexOf(postfix)
        let eof = false
        let remaining_buffer = Buffer.from("", encoding)
        if (idx !== -1) {
            chunk = buffer.slice(0, idx)
            remaining_buffer = buffer.slice(idx+postfix.length)
            eof = true
        }

        return [[chunk, remaining_buffer], eof]
    }

    _transform(chunk, enc, callback) {
        let err = null
        let data = null
        if (!chunk.length)
            err = new ServerDisconnectError("Server disconnected for client '" + this._client_name + "'")
        this._buffer = Buffer.concat([this._buffer, chunk])
        let [splitted_data, eof] = this._end_of_msg(this._buffer)
        if (eof) {
            data = splitted_data[0]
            this._buffer = splitted_data[1]
        }


        if (data) {
            zlib.unzip(data, (zip_err, zip_buffer) => {
                if (!zip_err) {
                    log.d("Recevied " + zip_buffer.length.toString() + " bytes from server")
                    callback(err, zip_buffer)
                }
                else
                    log.e(zip_err.message)
            })
        }
        else
            callback(err)

    }

}

let options;

function get_server() {
    if (!options && fs.existsSync(global.CONFIG_PATH)) {
        let data = fs.readFileSync(global.CONFIG_PATH, 'utf8')
        if (data) {
            options = JSON.parse(data)

            if (options.c_server_host !== undefined) {
                global.SERVER.HOST = options.c_server_host
            }

            if (options.c_server_port !== undefined) {
                global.SERVER.PORT = options.c_server_port
            }
        }
    }
    return [global.SERVER.HOST, global.SERVER.PORT]
}

class Client {

    constructor(name, server, session_id, client_id) {

        this.id = client_id || "hpx-desktop"
        this.name = name || "hpx-desktop"
        this._server = server || get_server()
        this._alive = false;
        this._ready = false;
        this._buffer = Buffer.from("", encoding)
        this.session = session_id || ""
        this.version = null;
        this.guest_allowed = false;
        this._accepted = false;

        this._last_user = ""
        this._last_pass = ""

        this._stream = new HPXTransform(this._name, {
            'defaultEncoding ': encoding
        })
        this._stream.on("data", this._recv.bind(this))
        
        this.timeout = 10
        this._sock = null;

        this._current_callback = null
        this._first_message = true
        this._promise_resolves = []
        this._on_connect_promise_resolves = []
        this._connecting = false
        this._resolved_connected_promises = false
        this._create_socket()
    }

    _create_socket() {
        this._sock = new net.Socket();
        this._sock.setTimeout(this.timeout, this._on_timeout.bind(this))
        this._sock.on("data", data => this._stream.write(data))
        this._sock.on("connect", this._on_connect.bind(this))
        this._sock.on("close", this._on_disconnect.bind(this))
        this._sock.on("end", this._on_disconnect.bind(this))
        this._sock.on("error", this._on_error.bind(this))
    }

    alive() {
        return this._alive;
    }

    ready() {
        return this._ready;
    }

    _server_info(data) {
        if (data) {
            let serv_data = data.data
            if (serv_data && serv_data.hasOwnProperty("version")) {
                this.guest_allowed = serv_data.guest_allowed || false
                this.version = serv_data.version
                this._ready = true
            }
        }
    }

    set_server(server) {
        this._server = server
    }

    async handshake(data, user, password, ignore_err) {
        if (this.alive()) {
            if (password === undefined)
                password = null

            if (user) {
                this._last_user = user
                this._last_pass = password
            }
            if (!ignore_err && data) {
                let serv_error = data.error
                if (serv_error) {
                    if (serv_error.code === exception_codes['AuthWrongCredentialsError'])
                        throw new AuthWrongCredentialsError(serv_error.msg);
                    else if (serv_error.code === exception_codes['AuthRequiredError'])
                        throw new AuthRequiredError(serv_error.msg);
                    else if (serv_error.code === exception_codes['AuthMissingCredentials'])
                        throw new AuthMissingCredentials(serv_error.msg);
                    else
                        throw new AuthError(serv_error.code.toString() + ': ' + serv_error.msg);
                }
            }

            if (!data) {
                let d = {}
                if (user) {
                    d.user = user
                    d.password = password
                }
                let serv_data = await this.send_raw(finalize(d, null, this.name, undefined))
                await this.handshake(serv_data, null, null, ignore_err)
            }
            else if (data) {
                let serv_data = data.data;
                if (serv_data === "Authenticated") {
                    this.session = data.session
                    this._accepted = true
                }
            }
        }
    }

    async request_auth(ignore_err) {
        let data = await this.send({
            'session': "", 'name': this.name,
            'data': 'requestauth'
        })
        this._server_info(data)
        await this.handshake(null, this._last_user, this._last_pass, ignore_err)
    }

    is_connected() {
        return self.alive()
    }

    async connect() {
        let p = new Promise((resolve, reject) => {
            if (!this._alive && !this._connecting) {
                this._on_connect_promise_resolves.unshift([resolve, reject])
                log.i("Client connecting to server at: " + JSON.stringify(this._server))
                this._connecting = true
                this._sock.connect(this._server[1], this._server[0], () => {
                    this._connecting = false
                    this._alive = true
                    if (this.session)
                        this._accepted = true
                })
            }
            else
                resolve(false)
        })
        await p
        return this.alive()
    }

    _on_timeout() {

    }

    _on_connect() {
        log.i("Client successfully connected to server at: " + JSON.stringify(this._server))
    }

    _on_error(error) {
        this._connecting = false
        log.e(error.message)
        if (this._on_connect_promise_resolves.length) {
            let [_resolve, _reject] = this._on_connect_promise_resolves.shift()
            _reject(error)
        }
        this._disconnect()
    }


    _on_disconnect() {
        this._disconnect()
    }

    _disconnect() {
        this._alive = false
        this._accepted = false
        this.session = ""
        this._ready = false
        this._first_message = true
    }

    async send(msg) {
        return this._send(finalize(msg, this.session, this.name, undefined, {to_bytes:true, to_json:true}))
    }

    async send_raw(msg) {
        return this._send(Buffer.from(JSON.stringify(msg), encoding))
    }

    async _send(msg_bytes) {
        let p = new Promise((resolve, reject) => {
            if (!this._alive) {
                throw new ClientError("Client '" + this.name + "' is not connected to server")
            }

            log.d("Sending " + msg_bytes.length.toString() + " bytes to server " + JSON.stringify(this._server))

                zlib.gzip(msg_bytes, (err, buffer) => {
                    if (!err) {
                        console.log("Sending data server")
                        this._sock.write(buffer)
                        this._sock.write(postfix)
                    } else {
                        reject(err)
                    }
                    this._promise_resolves.unshift([resolve, reject])
            });
        })

        return p
    }

    _recv(data) {
        let parsed_data = JSON.parse(data.toString())
        if (this._first_message) {
            this._first_message = false
            this._server_info(parsed_data)
        }

        if (this._on_connect_promise_resolves.length) {
            while (this._on_connect_promise_resolves.length) {
                let [_resolve, _reject] = this._on_connect_promise_resolves.shift()
                _resolve(true)
            }
            if (!this._resolved_connected_promises) {
                this._resolved_connected_promises = true
                return
            }
        }

        if (this._promise_resolves.length) {
            let [resolve, reject] = this._promise_resolves.shift()
            resolve(parsed_data)
            return
        }
    }

    close() {
        log.i("Closing connection to server")
        this._disconnect()
        this._sock.end()
    }




}

exports.Client = Client

