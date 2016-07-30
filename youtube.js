registerPlugin({
    name: 'Youtube Search',
    version: '1.2.1',
    description: 'Youtube video search',
    author: 'NT5',
    vars: {
        api_key: {
            title: 'API KEY (https://console.developers.google.com/project)',
            type: 'string'
        },
        yt_dl_action: {
            title: 'Action with YoutubeDL',
            type: 'select',
            options: [
                'Nothing',
                'Donwload',
                'Play'
            ]
        },
        yt_dl_playback: {
            title: 'Playback action',
            type: 'select',
            options: [
                'Queue',
                'Force play'
            ]
        },
        command_permissionsServergroups: {
            title: 'List of server groups that the bot should accept command (one per line)',
            type: 'multiline',
            placeholder: 'Leave it blank to accept everybody'
        },
        command_trigger: {
            title: 'Command trigger',
            type: 'string',
            placeholder: 'youtube'
        },
        text_format: {
            title: 'Message Format (supports bbcode) <{title}, {description}, {yt_link}, {upload_by}>',
            type: 'multiline',
            placeholder: '[B]You[/B][COLOR=#ff0000]Tube[/COLOR] - Title: {title} - Description: {description} - Link: [url={yt_link}]{yt_link}[/url] - By: {upload_by}'
        },
        catch_url: {
            title: 'Catch YouTube Links',
            type: 'select',
            options: [
                'Yes',
                'No'
            ]
        }
    }
}, function(sinusbot, config) {

    var api_url = "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults=1&q={query_search}&key={api_key}";

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

    function send_msg(ev, msg) {
        switch (ev.mode) {
            case 1:
                sinusbot.chatPrivate(ev.clientId, msg);
                break;
            case 2:
                sinusbot.chatChannel(msg);
                break;
            default:
                sinusbot.chatServer(msg);
                break;
        }
    }

    function search_yt(str, ev) {
        sinusbot.http({
            method: 'GET',
            url: api_url.format({
                query_search: escape(str),
                api_key: config.api_key
            }),
            headers: {
                'Content-Type': 'application/json; charset=UTF-8'
            }
        }, function(err, res) {
            if (err) {
                send_msg(ev, "API Request error");
                sinusbot.log(err);
            } else {
                if (res.statusCode == 200) {
                    var q = JSON.parse(res.data),
                        sq;
                    if ("items" in q && q.items.length > 0 && "snippet" in q.items[0] && q.items[0].id.kind == "youtube#video") {
                        sq = q.items[0].snippet;
                        var default_format = "[B]You[/B][COLOR=#ff0000]Tube[/COLOR] - Title: {title} - Description: {description} - Link: [url={yt_link}]{yt_link}[/url] - By: {upload_by}",
                            str_msg, str_vars;
                        str_msg = (typeof config.text_format == 'undefined' || config.text_format.length == 0 ? default_format : config.text_format);
                        str_vars = {
                            title: sq.title,
                            description: sq.description,
                            yt_link: "http://www.youtube.com/watch?v={0}".format(q.items[0].id.videoId),
                            upload_by: sq.channelTitle
                        };
                        send_msg(ev, str_msg.format(str_vars));
                        if (ev.mode == 2) {
                            var ytdl_action = parseInt(config.yt_dl_action),
                                url = "{yt_link}".format(str_vars),
                                queue = (parseInt(config.yt_dl_playback) === 0 || typeof config.yt_dl_playback == 'undefined' ? true : false);
                            switch (ytdl_action) {
                                case 1: // Download
                                    sinusbot.log("Donwload: " + url);
                                    sinusbot.ytdl(url, (queue ? false : true));
                                    if (queue) {
                                        sinusbot.log("Append to queue: " + url);
                                        sinusbot.qyt(url);
                                    }
                                    break;
                                case 2: // Play
                                    if (queue) {
                                        sinusbot.log("Append to queue: " + url);
                                        sinusbot.qyt(url);
                                    } else {
                                        sinusbot.log("Playing: " + url);
                                        sinusbot.yt(url);
                                    }
                                    break;
                                default: // Nothing
                                    break;
                            }
                        }
                    } else {
                        send_msg(ev, "Search failed (Nothing found)");
                    }
                } else {
                    send_msg(ev, "Search failed (Bad request)");
                    sinusbot.log("(Bad request) Status Code: " + res.statusCode);
                }
            }
        });
    }

    sinusbot.on('chat', function(ev) {
        if (ev.clientId == sinusbot.getBotId()) return;
        var is_valid = -1,
            validSGgroups = (typeof config.command_permissionsServergroups == 'undefined' || config.command_permissionsServergroups.length == 0 ? [] : config.command_permissionsServergroups.split('\n'));
        if (validSGgroups.length > 0) {
            ev.clientServerGroups.forEach(function(group) {
                if (validSGgroups.indexOf(group.n) > -1) {
                    is_valid++;
                }
            });
            if (is_valid == -1) return;
        }

        var cmd, text, re = /^!(\w+)\s*(.+)/;
        var youtube_rgx = /(?:http|https)\:\/\/www\.(?:youtube\.com|youtu\.be)\/watch\?v\=([\w\-]+)/,
            yt_videoId;
        var cmd_trigger = (typeof config.command_trigger == 'undefined' || config.command_trigger.length == 0 ? 'youtube' : config.command_trigger);
        if ((text = re.exec(ev.msg)) !== null) {
            cmd = text[1].toLowerCase();
            text = text[2];
            if (cmd === cmd_trigger) {
                if (text.length > 0) {
                    search_yt(text, ev);
                }
            }
        } else {
            if (parseInt(config.catch_url) !== 1 && (yt_videoId = youtube_rgx.exec(ev.msg)) !== null) {
                search_yt(yt_videoId, ev);
            }
        }
    });
});
