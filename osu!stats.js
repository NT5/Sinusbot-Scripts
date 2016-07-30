registerPlugin({
    name: 'Osu!Stats',
    version: '1.0',
    description: 'Osu! account statistics',
    author: 'NT5',
    vars: {
        api_key: {
            title: 'API KEY (http://osu.ppy.sh/p/api)',
            type: 'string'
        },
        text_format: {
            title: 'Message Format',
            type: 'multiline',
            placeholder: 'Player: {player_name} - Play Count: {play_count} - Ranked Score: {ranked_score} - Total Score: {total_score} - PP: {pp_raw} - Accuracy: {accuracy}% - Level: {level} - Country: {country}'
        },
        default_gamemode: {
            title: 'Default gamemode',
            type: 'select',
            options: [
                'Standar',
                'Taiko',
                'CTB',
                'Mania'
            ]
        }
    }
}, function(sinusbot, config) {
    if (!String.prototype.format) {
        String.prototype.format = function() {
            var str = this.toString();
            if (!arguments.length) {
                return str;
            }
            var args = typeof arguments[0],
                args = (("string" == args || "number" == args) ? arguments : arguments[0]);
            for (arg in args) {
                str = str.replace(RegExp("\\{" + arg + "\\}", "gi"), args[arg]);
            }
            return str;
        }
    }

    function addCommas(nStr) {
        nStr += '';
        x = nStr.split('.');
        x1 = x[0];
        x2 = x.length > 1 ? '.' + x[1] : '';
        var rgx = /(\d+)(\d{3})/;
        while (rgx.test(x1)) {
            x1 = x1.replace(rgx, '$1' + ',' + '$2');
        }
        return x1 + x2;
    }
    var api_url = "https://osu.ppy.sh/api/get_user?k={0}&u={1}&m={2}";
    sinusbot.on('chat', function(ev) {
        var send_msg = function(id, mode, msg) {
            switch (mode) {
                case 1:
                    sinusbot.chatPrivate(id, msg);
                    break;
                case 2:
                    sinusbot.chatChannel(msg);
                    break;
                default:
                    sinusbot.chatServer(msg);
                    break;
            }
        };
        var self = sinusbot.getBotId();
        if (ev.clientId == self) return;
        var cmd, text, re = /^!(\w+)\s*(.+)/;
        if ((text = re.exec(ev.msg)) !== null) {
            cmd = text[1].toLowerCase();
            text = text[2];
            if (cmd === 'osu') {
                if (text.length > 0) {
                    if (typeof config.api_key == 'undefined' || config.api_key.length == 0) {
                        send_msg(ev.clientId, ev.mode, "Invalid API KEY");
                    } else {
                        var mod_re = /^(?:m|gamemode|mode):(standar|taiko|ctb|mania\*?)\s(.+)/i;
                        var gamemode, player;
                        if ((mod_re = mod_re.exec(text)) !== null) {
                            gamemode = mod_re[1];
                            player = mod_re[2];
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
                        sinusbot.http({
                            method: 'GET',
                            url: api_url.format(config.api_key, player, gamemode)
                        }, function(err, res) {
                            if (err) {
                                send_msg(ev.clientId, ev.mode, "API Request error");
                            } else {
                                if (res.statusCode == 200) {
                                    var p = JSON.parse(res.data);
                                    if (p.length > 0) {
                                        p = p[0];
                                        var default_str = "Player: {player_name} - Play Count: {play_count} - Ranked Score: {ranked_score} - Total Score: {total_score} - PP: {pp_raw} - Accuracy: {accuracy}% - Level: {level} - Country: {country}",
                                            str_msg;
                                        str_msg = (typeof config.text_format == 'undefined' || config.text_format.length == 0 ? default_str : config.text_format);
                                        send_msg(ev.clientId, ev.mode, str_msg.format({
                                            player_name: p.username,
                                            play_count: addCommas(p.playcount),
                                            ranked_score: addCommas(Math.floor(p.ranked_score)),
                                            total_score: addCommas(Math.floor(p.total_score)),
                                            pp_raw: addCommas(Math.floor(p.pp_raw)),
                                            accuracy: Math.floor(p.accuracy),
                                            level: Math.floor(p.level),
                                            country: p.country
                                        }));
                                    } else {
                                        send_msg(ev.clientId, ev.mode, "{0} Unknown player".format(player));
                                    }
                                }
                            }
                        });
                    }
                }
            }
        }
    });
});
