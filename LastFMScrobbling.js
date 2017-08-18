registerPlugin({
    name: 'LastFM Scrobbling',
    version: '0.0.2',
    engine: '>= 0.9.18',
    description: 'Scrobbling Tracks to LastFM',
    author: 'NT5',
    vars: [
        {
            name: 'lsfm_username',
            title: 'LastFM Username',
            placeholder: 'The last.fm username or email address.',
            default: 'foo',
            type: 'string'
        },
        {
            name: 'lsfm_password',
            title: 'LastFM password in plain text',
            default: 'bar',
            type: 'password'
        }
    ]
}, function (sinusbot, config, manifest) {

    var engine = require('engine');
    var event = require('event');
    var store = require('store');
    var helpers = require('helpers');

    // String format util
    if (!String.prototype.format) {
        String.prototype.format = function () {
            var str = this.toString();
            if (!arguments.length) {
                return str;
            }
            var args = typeof arguments[0];
            args = (("string" === args || "number" === args) ? arguments : arguments[0]);
            for (var arg in args) {
                str = str.replace(RegExp("\\{" + arg + "\\}", "gi"), args[arg]);
            }
            return str;
        }
    }

    // URL format util http://stackoverflow.com/questions/1714786/
    function URLSerialize (obj, prefix) {
        var str = [], p;
        for (p in obj) {
            if (obj.hasOwnProperty(p)) {
                var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
                str.push((v !== null && typeof v === "object") ?
                         URLSerialize(v, k) :
                         encodeURIComponent(k) + "=" + encodeURIComponent(v));
            }
        }
        return str.join("&");
    }

    // Polyfill util https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
    if (typeof Object.assign !== 'function') {
        Object.assign = function (target, varArgs) { // .length of function is 2
            'use strict';
            if (target === null) { // TypeError if undefined or null
                throw new TypeError('Cannot convert undefined or null to object');
            }

            var to = Object(target);

            for (var index = 1; index < arguments.length; index++) {
                var nextSource = arguments[index];

                if (nextSource !== null) { // Skip over if undefined or null
                    for (var nextKey in nextSource) {
                        // Avoid bugs when hasOwnProperty is shadowed
                        if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
                            to[nextKey] = nextSource[nextKey];
                        }
                    }
                }
            }
            return to;
        };
    }

    var app = {
        util: {
            get_timestamp: function () {
                return Math.floor(Date.now() / 1000);
            },
            parse_track: function (track) {
                var artist = track.tempArtist() || track.artist() || 'Sinus DJ',
                    title = track.tempTitle() || track.title() || 'Sinus Track';

                return {artist: artist, title: title};
            },
            unset_all: function () {
                var keys = store.getKeys();
                keys.forEach(function (key) {
                    store.unset(key);
                });
            }
        },
        config: {
            lastfm: {
                username: config.lsfm_username || '',
                password: config.lsfm_password || ''
            },
            plugin: {
                manifest: {
                    name: manifest.name,
                    version: manifest.version,
                    description: manifest.description,
                    authors: [
                        {
                            name: 'NT5',
                            role: 'Main Dev'
                        }
                    ]
                }
            },
            api: {
                lastfm: {
                    url: 'https://ws.audioscrobbler.com/2.0/?{data}',
                    api_key: '6485c66027a4fc738ff0175028cead10',
                    api_secret: 'bccc1c85b8e99b5e97fc5bd3829655a9'
                }
            }
        },
        getJSON: function (options) {
            options = (typeof options !== "object") ? {} : options;

            options.method = options.method || 'GET';
            options.url = options.url || '';
            options.headers = options.headers || { 'Content-Type': 'application/json; charset=UTF-8' };
            options.callback = options.callback || function (err, res) { engine.log(res); };
            options.error_callback = options.error_callback || function (err, res) { engine.log(err); };

            /*
             TODO
              - [ENH] Port to new script engine
            */
            sinusbot.http({
                method: options.method,
                url: options.url,
                headers: options.headers
            }, function (err, res) {
                if (err || res.statusCode !== 200) {
                    engine.log('Request error [{error}] Code: [{code}] Data: [{data}]'.format({
                        error: err,
                        data: res.data,
                        code: res.statusCode
                    }));
                    options.error_callback(err, res);
                } else {
                    var json = JSON.parse(res.data);
                    options.callback(json);
                }
            });
        },
        api: {
            lastfm: {
                signature_call: function (data) {
                    var api_secret = app.config.api.lastfm.api_secret || '0';
                    var api_sig = [];

                    Object.keys(data).forEach(function (key) {
                        var value = data[key];
                        api_sig.push(key + "" + value);
                    });
                    api_sig.push(api_secret);
                    return helpers.MD5Sum(api_sig.join(''));
                },
                postData: function (data, callback) {
                    var url =  app.config.api.lastfm.url;

                    var post_data = Object.assign(data, {
                        api_sig: app.api.lastfm.signature_call(data),
                        format: 'json'
                    });

                    app.getJSON({
                        method: 'POST',
                        url: url.format({
                            data: URLSerialize(post_data)
                        }),
                        callback: callback,
                        error_callback: function (err, res) {
                            var json = JSON.parse(res.data);
                            if (json.error === 9) {
                                app.callbacks.lastfm.store_login();
                            }
                        }
                    });
                },
                getMobileSession: function (username, password, callback) {
                    var api_key = app.config.api.lastfm.api_key;

                    app.api.lastfm.postData({
                        api_key: api_key,
                        method: 'auth.getMobileSession',
                        password: password,
                        username: username
                    }, callback);

                },
                getSession: function (token, callback) {
                    var api_key = app.config.api.lastfm.api_key;

                    app.api.lastfm.postData({
                        api_key: api_key,
                        method: 'auth.getSession',
                        token: token
                    }, callback);
                },
                updateNowPlaying: function (artist, title) {
                    var api_key = app.config.api.lastfm.api_key,
                        client_token = app.callbacks.lastfm.get_store_token();

                    app.api.lastfm.postData({
                        api_key: api_key,
                        artist: artist,
                        method: 'track.updateNowPlaying',
                        sk: client_token,
                        track: title
                    });

                    engine.log("Scroblling Now Playing: {track} | {artist}".format({
                        artist: artist,
                        track: title
                    }));
                },
                scrobble: function (artist, title) {
                    var api_key = app.config.api.lastfm.api_key,
                        client_token = app.callbacks.lastfm.get_store_token();

                    app.api.lastfm.postData({
                        api_key: api_key,
                        artist: artist,
                        chosenByUser: '0',
                        method: 'track.scrobble',
                        sk: client_token,
                        timestamp: app.util.get_timestamp(),
                        track: title
                    });

                    engine.log("Scroblling: {track} | {artist}".format({
                        artist: artist,
                        track: title
                    }));
                }
            }
        },
        callbacks: {
            lastfm: {
                store_login: function () {
                    var username = app.config.lastfm.username,
                        password = app.config.lastfm.password;

                    var lastfm_client = {
                        token: 0,
                        username: username,
                        password: password
                    };

                    app.api.lastfm.getMobileSession(username, password, function (json) {
                        var token = json.session.key;
                        lastfm_client.token = token;
                        engine.log("Login as {username}".format({
                            username: username
                        }));
                        store.set('lastfm_client', lastfm_client);
                    });
                },
                get_store_token: function () {
                    var lastfm_client = store.get('lastfm_client');
                    return (lastfm_client ? lastfm_client.token : 0);
                }
            }
        }
    };

    // Check for script version & loggin
    (function () {
        var version = store.get('script_version')

        // Version reset
        if (version !== app.config.plugin.manifest.version) {
            app.util.unset_all();
            engine.saveConfig({});

            engine.log('Your running a different version of the script, resetting configuration, please reconfigure it from web panel.');
            engine.notify('Configure LastFM script');

            store.set('script_version', app.config.plugin.manifest.version);
        }

        // LastFM loggin
        var username = app.config.lastfm.username,
            password = app.config.lastfm.password;

        var lastfm_client = store.get('lastfm_client');
        if (lastfm_client && (username !== lastfm_client.username || password !== lastfm_client.password)) {
            app.callbacks.lastfm.store_login();
        }

    }());

    event.on('trackInfo', function (track) {
        var _track = app.util.parse_track(track);
        app.api.lastfm.updateNowPlaying(_track.artist, _track.title);
    });

    event.on('trackEnd', function (track) {
        var _track = app.util.parse_track(track);
        app.api.lastfm.scrobble(_track.artist, _track.title);
    });

});