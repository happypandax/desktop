const EventEmitter = require('events');
const client = require('./client');
const log = require('./log');
const Promise = require('./bluebird');
const crypto = require('crypto');
const AsyncLock = require('./async_lock');

Promise.longStackTraces();

(function () {

    class ClientEmitter extends EventEmitter { }

    const main_client = "client"

    let all_clients = {}
    let lock = new AsyncLock()
    let all_emitters = {}

    function _create_clients(id, session_id) {
        session_id = session_id || ""
        all_clients[id] = {
            "client": new client.Client("webclient", undefined, session_id, id),
            "notification": new client.Client("notification", undefined, session_id, id),
            "command": new client.Client("command", undefined, session_id, id)
        }

    }

    function poll_func(fn, timeout, interval) {
        var startTime = (new Date()).getTime();
        interval = interval || 1000;
        var canPoll = true;

        (function p() {
            canPoll = ((new Date).getTime() - startTime) <= timeout;
            interval = fn()
            if (interval && canPoll) { // ensures the function exucutes
                setTimeout(p, interval);
            }
        })();
    }

    async function _connect_clients(clients) {
        let p = null;
        for (var name in clients)
            p = await clients[name].connect()
        return p
    }

    async function _handshake_clients(clients, username, password, request) {
        if (!clients[main_client].alive()) {
            await clients[main_client].connect()
        }

        if (request)
            await clients[main_client].request_auth()
        else
            await clients[main_client].handshake(null, username, password)

        for (var name in clients) {
            if (name == main_client)
                continue
            let c = clients[name]
            if (!c.alive())
                await c.connect()
            c.session = clients[main_client].session
            c._accepted = clients[main_client]._accepted
        }

    }

    function get_clients(id, session_id) {
        if (!all_clients.hasOwnProperty(id)) {
            _create_clients(id, session_id)
        }
        clients = all_clients[id]

        for (var name in clients)
            clients[name].session = clients[main_client].session

        return clients
    }

    function send_error(client_id, ex, ...kwargs) {
        let s
        try { s = ex.__repr__() }
        catch {}

        if (s === undefined)
            s = `${ex}`
        log.e(`${s}: ${ex.stack}`)
        all_emitters[client_id].emit('exception', {
           error: s})
    }

    async function call_server(client_id, serv_data, root_client, client) {
        return await lock.acquire('client', async () => {
            let data = null
            if (client.alive()) {
                try {
                    if (!serv_data['session'])
                        serv_data['session'] = root_client.session
                    data = await client.send_raw(serv_data)
                } catch (e) {
                    if (e instanceof client.ServerError)
                        send_error(client_id, e)
                    else
                        throw e
                }
            } else {
                log.d(`Cannot send because server is not connected:\n\t ${serv_data.toString()}`)
            }
            return data
        })
    }

    

    class IO {
        constructor(url) {
            const token_length = 8
            const sid = crypto.randomBytes(Math.ceil(token_length / 2)).toString('hex').slice(0, token_length) + url;

            all_emitters[sid] = new ClientEmitter()

            var obj = this;

            let io_events = {
                'connect': () => all_emitters[sid].emit('connect'),
                'connect_error': (error) => all_emitters[sid].emit('connect_error', error),
                'connect_timeout': (timeout) => all_emitters[cliensidt_id].emit('connect_timeout', timeout),
                'error': (error) => all_emitters[sid].emit('error', error),
                'disconnect': (reason) => all_emitters[sid].emit('disconnect', reason),
                'reconnect': (attemptNumber) => all_emitters[sid].emit('reconnect', attemptNumber),
                'reconnect_attempt': (attemptNumber) => all_emitters[sid].emit('reconnect_attempt', attemptNumber),
                'reconnecting': (attemptNumber) => all_emitters[sid].emit('reconnecting', attemptNumber),
                'reconnect_error': (error) => all_emitters[sid].emit('reconnect_error', error),
                'reconnect_failed': () => all_emitters[sid].emit('reconnect_failed'),
                'ping': () => all_emitters[sid].emit('ping'),
                'pong': (latency) => all_emitters[sid].emit('pong', latency)
            };

            let hpx_events = {
                'command': async msg => {

                    let f = async (msg) => {
                        clients = get_clients(!(msg.session_id === undefined) ? msg.session_id : "default")
                        await this.on_command_handle(sid, clients, msg)
                    }
                    await f(msg).catch(e => {
                        send_error(sid, e)
                    })
                },
                'server_call': async msg => {
                    let f = async (msg) => {
                        clients = get_clients(!(msg.session_id === undefined) ? msg.session_id : "default")
                        await this.on_server_call_handle(sid, clients[main_client], msg)
                    }
                    await f(msg).catch(e => {
                        send_error(sid, e)
                    })
                }
            }

            this.id = "hpx-desktop";
            this.connected = true;
            this.disconnected = false;
            this.open = function () { return obj; };
            this.close = function () { return obj; };
            this.compress = function (value) { return obj; };
            this.binary = function (value) { return obj; };
            this.connect = this.open;
            this.disconnect = this.close;

            this.on = function (name, callback) {
                all_emitters[sid].on(name, callback);
            };

            this.emit = function (ev_name, ...args) {
                hpx_events[ev_name](args[0])
            };

            this.send = function (...args) {
            };

            setTimeout(io_events.connect, 100)

            all_emitters[sid].on('error', e => log.e(e));
        }

        async on_server_call_handle(client_id, client, msg, kwargs) {
            let root_client = get_clients(!(msg.session_id === undefined) ? msg.session_id : "default")[main_client]
            let data = await call_server(client_id, msg['msg'], root_client, client)
            msg['msg'] = data
            all_emitters[client_id].emit('server_call', msg)
        }

        async on_command_handle(client_id, clients, msg) {
            return await lock.acquire('client', async () => {
                let commands = {
                    'connect': 1,
                    'reconnect': 2,
                    'disconnect': 3,
                    'status': 4,
                    'handshake': 5,
                    'rehandshake': 6,
                }

                let d = {
                    'status': null,
                    'accepted': null,
                    'version': {},
                    'guest_allowed': null,
                    'id': msg.id || null
                }

                let cmd = msg.command
                d['command'] = cmd

                log.d("Client: " + client_id.toString() + " Command: " + cmd.toString())

                try {
                    if (cmd == commands['connect']) {
                        if (!clients[main_client].alive())
                            await _connect_clients(clients)
                    }
                    else if (cmd == commands['reconnect']) {
                        if (!clients[main_client].alive()) {
                            try {
                                await _connect_clients(clients)
                            } catch (e) {
                                if (e instanceof client.ClientError)
                                    send_error(client_id, e)
                                else
                                    throw e
                            }
                        }
                    }
                    else if (cmd == commands['disconnect']) {
                        if (clients[main_client].alive())
                            clients[main_client].close()
                    }
                    else if (cmd == commands['status']) {
                        null
                    }

                    try {
                        if (cmd == commands['handshake']) {
                            await _handshake_clients(clients, msg.username || "", msg.password || "")
                        }
                        else if (cmd == commands['rehandshake']) {
                            await _handshake_clients(clients, null, null, true)
                        }

                    } catch (e) {
                        if (e instanceof client.AuthError)
                            send_error(client_id, e)
                        else
                            throw e
                    }

                    log.d("Finish Client: " + client_id.toString() + " Command: " + cmd.toString())

                    d['status'] = clients['client'].ready()
                    d['accepted'] = clients['client']._accepted
                    d['guest_allowed'] = clients['client'].guest_allowed
                    d['version'] = clients['client'].version

                } catch (e) {
                    if (e instanceof client.ServerError)
                        send_error(client_id, e)
                    else
                        throw e
                }

                all_emitters[client_id].emit("command", d)
            })
            }
    }

    function io(url) {
        return new IO(url);
    }

    module.exports = io;

    })();

