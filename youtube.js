registerPlugin({
    name: 'Youtube Search',
    version: '1.2.3',
    description: 'Youtube video search Queue & Player',
    author: 'NT5',
    vars: [
        {
            name: 'api_key',
            title: 'API KEY (https://console.developers.google.com/project)',
            type: 'string'
        },
        {
            name: 'yt_dl_action',
            title: 'Action with YoutubeDL',
            type: 'select',
            options: [
                'Nothing',
                'Donwload',
                'Play'
            ]
        },
        {
            name: 'yt_dl_playback',
            title: 'Playback action',
            type: 'select',
            options: [
                'Queue',
                'Force play'
            ]
        },
        {
            name: 'command_permissionsServergroups',
            title: 'List of server groups that the bot should accept command (one per line)',
            type: 'multiline',
            placeholder: 'Leave it blank to accept everybody'
        },
        {
            name: 'command_trigger',
            title: 'Command trigger',
            type: 'string',
            placeholder: 'youtube'
        },
        {
            name: 'text_format',
            title: 'Message Format (supports bbcode) <{title}, {description}, {yt_link}, {upload_by}>',
            type: 'multiline',
            placeholder: '[B]You[/B][COLOR=#ff0000]Tube[/COLOR] - Title: {title} - Description: {description} - Link: [url={yt_link}]{yt_link}[/url] - By: {upload_by}'
        },
        {
            name: 'catch_url',
            title: 'Catch YouTube Links',
            type: 'select',
            options: [
                'Yes',
                'No'
            ]
        }
        /*
         TODO
         - [FEATURE] Add a playlist support
        {
            name: 'catch_url_playlist',
            title: 'Catch YouTube playlist',
            type: 'select',
            options: [
                'Yes',
                'No'
            ]
        }
        */
    ]
}, function(sinusbot, config) {

    var backend = require('backend');
    var engine = require('engine');
    var event = require('event');

    // String format util
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

    // Plugin Methods
    var youtube = {
        config: {
            api: {
                url: "https://www.googleapis.com/youtube/v3/search?part=snippet&maxResults={maxResults}&q={query_search}&key={api_key}",
                api_key: config.api_key || '',
                maxresults: 1
            },
            plugin: {
                regex: {
                    cmd: /^!(\w+)\s*(.+)/,
                    youtube: /(?:http|https)\:\/\/www\.(?:youtube\.com|youtu\.be)\/watch\?v\=([\w\-]+)/
                },
                command_trigger: (typeof config.command_trigger === 'undefined' || config.command_trigger.length === 0 ? 'youtube' : config.command_trigger.toLocaleLowerCase()),
                catch_url: (parseInt(config.catch_url) !== 1 ? true : false),
                message_format: (typeof config.text_format === 'undefined' || config.text_format.length == 0 ? '[B]You[/B][COLOR=#ff0000]Tube[/COLOR] - Title: {title} - Description: {description} - Link: [url={yt_link}]{yt_link}[/url] - By: {upload_by}' : config.text_format),
                ytdl_action: parseInt(config.yt_dl_action),
                ytdl_playback: (parseInt(config.yt_dl_playback) === 0 || typeof config.yt_dl_playback == 'undefined' ? true : false),
                server_groups: (typeof config.command_permissionsServergroups === 'undefined' || config.command_permissionsServergroups.length === 0 ? [] : config.command_permissionsServergroups.split('\n'))
            }
        },
        msg: function(options) {
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
                        youtube.msg({
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
                        youtube.msg({
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
        callbacks: {
            search: {
                done: function(client, channel, mode, data) {
                    var sq;
                    if ("items" in data && data.items.length > 0 && "snippet" in data.items[0] && data.items[0].id.kind == "youtube#video") {
                        sq = data.items[0].snippet;
                        // Prepare string variables
                        var str_vars = {
                            title: sq.title,
                            description: sq.description,
                            yt_link: "http://www.youtube.com/watch?v={0}".format(data.items[0].id.videoId),
                            upload_by: sq.channelTitle
                        };

                        // Send message
                        youtube.msg({
                            text: youtube.config.plugin.message_format.format(str_vars),
                            channel: channel,
                            client: client,
                            mode: mode
                        });

                        // YoutubeDL only if channel trigger
                        if (mode === 2) { // Mode: 2 channel message
                            var media = require('media');

                            var url = "{yt_link}".format(str_vars);
                            var queue = youtube.config.plugin.ytdl_playback;

                            /*
                            {youtube.config.plugin.ytdl_action}
                             1: Download
                             2: Play
                             !: Nothing
                            */
                            switch (youtube.config.plugin.ytdl_action) {
                                case 1: // Download
                                    engine.log("Donwload: " + url);
                                    media.ytdl(url, (queue ? false : true));
                                    if (queue) {
                                        engine.log("Append to queue: " + url);
                                        // media.enqueueYt(url);
                                        sinusbot.qyt(url);
                                    }
                                    break;
                                case 2: // Play
                                    if (queue) {
                                        engine.log("Append to queue: " + url);
                                        // media.enqueueYt(url);
                                        sinusbot.qyt(url);
                                    } else {
                                        engine.log("Playing: " + url);
                                        media.yt(url);
                                    }
                                    break;
                                default: // Nothing
                                    break;
                                                                     }
                        }
                    } else {
                        youtube.msg({
                            text: "Search failed (Nothing found)",
                            channel: channel,
                            client: client,
                            mode: mode
                        });
                    }
                },
                error: function(client, channel, mode, data) {
                    youtube.msg({
                        text: "Search failed (Bad request)",
                        channel: channel,
                        client: client,
                        mode: mode
                    });
                }
            }
        },
        search: function(options) {
            options = (typeof options !== "object") ? {} : options;

            options.query = options.query || '';
            options.maxresults = options.maxresults || youtube.config.api.maxresults;
            options.api_key = options.api_key || youtube.config.api.api_key;
            options.callback = options.callback || function(json) { engine.log(json); };
            options.error_callback = options.error_callback || function(error) { engine.log(error); };

            /*
             TODO
             - [ENH] Port to new script engine
            */
            sinusbot.http({
                method: 'GET',
                url: youtube.config.api.url.format({
                    query_search: escape(options.query),
                    api_key: options.api_key,
                    maxResults: options.maxresults
                }),
                headers: {
                    'Content-Type': 'application/json; charset=UTF-8'
                }
            }, function(err, res) {
                if (err || res.statusCode != 200) {
                    options.error_callback(err);
                } else {
                    var json = JSON.parse(res.data);
                    options.callback(json);
                }
            });
        }
    };

    // Chat event
    event.on('chat', function(ev) {
        var client = ev.client;
        var channel = ev.channel;

        if (client.isSelf()) return;

        // Check for valid groups
        /*
         TODO
         - [ENH] Better way to split groups
         - [BUG] Make sure if works in all cases
        */
        var is_valid = -1, validSGgroups = youtube.config.plugin.server_groups;
        if (validSGgroups.length > 0) {
            client.getServerGroups().forEach(function(group) {
                if (validSGgroups.indexOf(group.n) > -1) {
                    is_valid++;
                }
            });
            if (is_valid == -1) return;
        }

        var cmd, text;

        // Regex text: !{command} {text}
        if ((text = youtube.config.plugin.regex.cmd.exec(ev.text)) !== null) {
            cmd = text[1].toLowerCase(); // command trigger
            text = text[2]; // args
            if (cmd === youtube.config.plugin.command_trigger && text.length > 0) {
                // trigger search {text}
                youtube.search({
                    query: text,
                    callback: function(data) {
                        youtube.callbacks.search.done(client, channel, ev.mode, data);
                    },
                    error_callback: function(data) {
                        youtube.callbacks.search.error(client, channel, ev.mode, data);
                    }
                });
            }
        } else {
            // No command format found; check if a valid Youtube URL
            var videoId;
            if (youtube.config.plugin.catch_url && (videoId = youtube.config.plugin.regex.youtube.exec(ev.text)) !== null) {
                /*
                 TODO
                 - [BUG] Sometimes gives wrong video
                */
                // trigger search {videoId}
                youtube.search({
                    query: videoId,
                    callback: function(data) {
                        youtube.callbacks.search.done(client, channel, ev.mode, data);
                    },
                    error_callback: function(data) {
                        youtube.callbacks.search.error(client, channel, ev.mode, data);
                    }
                });
            }
        }
    });
});
