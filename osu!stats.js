registerPlugin({
    name: 'Osu!Stats',
    version: '1.1',
    description: 'Osu! account statistics',
    author: 'NT5',
    vars: [
        {
            name: 'api_key',
            title: 'API KEY (http://osu.ppy.sh/p/api)',
            type: 'string'
        },
        {
            name: 'text_format',
            title: 'Message Format',
            type: 'multiline',
            placeholder: 'Player: {player_name} - Play Count: {play_count} - Ranked Score: {ranked_score} - Total Score: {total_score} - PP: {pp_raw} - Accuracy: {accuracy}% - Level: {level} - Country: {country}'
        },
        {
            name: 'default_gamemode',
            title: 'Default gamemode',
            type: 'select',
            options: [
                'Standar',
                'Taiko',
                'CTB',
                'Mania'
            ]
        }
    ]
}, function (sinusbot, config) {

    var backend = require('backend');
    var engine = require('engine');
    var event = require('event');

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

    var osu = {
        config: {
            api: {
                url: "https://osu.ppy.sh/api/get_user?k={0}&u={1}&m={2}",
                key: config.api_key || false
            },
            plugin: {
                regex: {
                    cmd: /^!(\w+)\s*(.+)/,
                    gamemode: /^(?:m|gamemode|mode):(standar|taiko|ctb|mania\*?)\s(.+)/i
                },
                trigger: 'osu',
                gamemode: parseInt(config.default_gamemode),
                message: config.text_format || 'Player: {player_name} - Play Count: {play_count} - Ranked Score: {ranked_score} - Total Score: {total_score} - PP: {pp_raw} - Accuracy: {accuracy}% - Level: {level} - Country: {country}'
            }
        },
        msg: function (options) {
            options = (typeof options !== "object") ? {} : options;

            options.text = options.text || '';
            options.mode = options.mode || 0;
            options.backend = options.backend || backend;
            options.client = options.client || false;
            options.channel = options.channel || false;

            /*
             TODO
             - [BUG] Make sure if works in all cases
            */
            switch(options.mode) {
                case 1: // Private client message
                    if (options.client) {
                        options.client.chat(options.text);
                    } else {
                        osu.msg({
                            text: options.text,
                            backend: options.backend,
                            mode: 0
                        });
                    }
                    break;
                case 2: // Channel message
                    if (options.channel) {
                        options.channel.chat(options.text);
                    } else {
                        osu.msg({
                            text: options.text,
                            backend: options.backend,
                            mode: 0
                        });
                    }
                    break;
                default: // Server message
                    options.backend.chat(options.text);
                    break;
            }

        },
        fetch: function (options) {
            options = (typeof options !== "object") ? {} : options;

            options.api_key = options.api_key || osu.config.api.key;
            options.player = options.player || 'peppy';
            options.gamemode = options.gamemode || 0;
            options.callback = options.callback || function (json) { engine.log(json); };
            options.error_callback = options.error_callback || function (error) { engine.log(error); };

            /*
             TODO
             - [ENH] Port to new script engine
            */
            sinusbot.http({
                method: 'GET',
                url: osu.config.api.url.format(options.api_key, options.player, options.gamemode),
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                }
            }, function (err, res) {
                if (err || res.statusCode !== 200) {
                    options.error_callback(err);
                } else {
                    var json = JSON.parse(res.data);
                    options.callback(json);
                }
            });
        },
        callbacks: {
            fetch: {
                done: function (client, channel, mode, data) {
                    if (data.length > 0) {
                        data = data[0];

                        // Prepare format
                        var str_vars = {
                            player_name: data.username,
                            play_count: osu.util.addCommas(data.playcount),
                            ranked_score: osu.util.addCommas(Math.floor(data.ranked_score)),
                            total_score: osu.util.addCommas(Math.floor(data.total_score)),
                            pp_raw: osu.util.addCommas(Math.floor(data.pp_raw)),
                            accuracy: Math.floor(data.accuracy),
                            level: Math.floor(data.level),
                            country: data.country
                        };

                        osu.msg({
                            text: osu.config.plugin.message.format(str_vars),
                            channel: channel,
                            client: client,
                            mode: mode
                        });

                    } else {
                        osu.msg({
                            text: "Unknown player",
                            channel: channel,
                            client: client,
                            mode: mode
                        });
                    }
                },
                error: function (client, channel, mode, data) {
                    osu.msg({
                        text: "Search failed (Bad request)",
                        channel: channel,
                        client: client,
                        mode: mode
                    });
                }
            }
        },
        util: {
            addCommas: function (nStr) {
                nStr += '';
                var x = nStr.split('.'),
                    x1 = x[0],
                    x2 = x.length > 1 ? '.' + x[1] : '',
                    rgx = /(\d+)(\d{3})/;

                while (rgx.test(x1)) {
                    x1 = x1.replace(rgx, '$1' + ',' + '$2');
                }
                return x1 + x2;
            }
        }
    };

    event.on('chat', function (ev) {
        var client = ev.client;
        var channel = ev.channel;

        if (client.isSelf()) return;

        var cmd, text;

        // Regex text: !{command} {text}
        if ((text = osu.config.plugin.regex.cmd.exec(ev.text)) !== null) {
            cmd = text[1].toLowerCase(); // Command trigger
            text = text[2]; // Args
            if (cmd === osu.config.plugin.trigger.toLowerCase() && text.length > 0) {
                // Trigger command {text}
                var gm_regx, gamemode, player;
                if ((gm_regx = osu.config.plugin.regex.gamemode.exec(text)) !== null) {
                    gamemode = gm_regx[1];
                    player = gm_regx[2];
                    switch (gamemode.toLowerCase()) {
                        case 'taiko':
                            gamemode = 1;
                            break;
                        case 'ctb':
                            gamemode = 2;
                            break;
                        case 'mania':
                            gamemode = 3;
                            break;
                        default:
                            gamemode = 0;
                            break;
                    }
                } else {
                    gamemode = config.default_gamemode;
                    player = text;
                }

                osu.fetch({
                    player: player,
                    gamemode: gamemode,
                    callback: function (data) {
                        osu.callbacks.fetch.done(client, channel, ev.mode, data);
                    },
                    error_callback: function (data) {
                        osu.callbacks.fetch.error(client, channel, ev.mode, data);
                    }
                });
            }
        }
    });
});
