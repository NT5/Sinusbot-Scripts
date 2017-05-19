registerPlugin({
    name: 'Youtube Search',
    version: '1.2.3',
    engine: '>= 0.9.17',
    description: 'Youtube video search Queue & Player',
    author: 'NT5',
    vars: [
        {
            name: 'yt_apikey',
            title: 'API KEY (https://console.developers.google.com/project)',
            type: 'string'
        },
        {
            name: 'ytdl_action',
            title: 'Action with YoutubeDL',
            type: 'select',
            indent: 1,
            options: [
                'Nothing',
                'Download',
                'Stream'
            ]
        },
        {
            name: 'ytdl_playback',
            title: 'Playback action',
            type: 'select',
            indent: 1,
            options: [
                'Queue',
                'Force play'
            ]
        },
        {
            name: 'yt_catchurl',
            title: 'Catch YouTube Links',
            type: 'checkbox'
        },
        {
            name: 'yt_maxresults',
            title: 'Max youtube videos (1~>=50)',
            type: 'number',
            placeholder: '1'
        },
        {
            name: 'yt_maxduration',
            title: 'Max youtube video duration for playback (in seconds) default 900seg (15min)',
            type: 'number',
            placeholder: '900'
        },
        {
            name: 'yt_randomplay',
            title: 'Play random video from search (only work if maxresults>=2)',
            type: 'checkbox'
        },
        {
            name: 'command_trigger',
            title: 'Command trigger',
            type: 'string',
            placeholder: 'youtube'
        },
        {
            name: 'command_message',
            title: 'Message Format (supports bbcode)',
            type: 'multiline',
            placeholder: '[B]You[/B][COLOR=#ff0000]Tube[/COLOR] - Title: {title} - Link: [url={yt_link}]{yt_link}[/url] - By: {upload_by}'
        },
        {
            name: 'command_blacklist',
            title: 'Title blacklist <comma saparated> (not playback if the title of video is here)',
            type: 'string',
            placeholder: '10 hours, ...'
        },
        {
            name: 'command_permissions',
            title: 'List of users that the bot should accept admin commands (ID or Name)',
            type: 'array',
            vars: [
                {
                    name: 'user',
                    type: 'string',
                    indent: 2,
                    placeholder: 'User name or id'
                }
            ]
        },
        {
            name: 'command_blacklistusers',
            title: 'Banned users <comma saparated>',
            type: 'string',
            placeholder: 'troleface, ...'
        },
        {
            name: 'command_permissionsServerGroups',
            title: 'List of server groups that the bot should accept command (ID or Name)',
            type: 'array',
            vars: [
                {
                    name: 'group',
                    type: 'string',
                    indent: 2,
                    placeholder: 'Group name or id'
                }
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

    // String truncate util http://stackoverflow.com/questions/1199352
    String.prototype.trunc = function( n, useWordBoundary ){
        if (this.length <= n) { return this; }
        var subString = this.substr(0, n-1);
        return (useWordBoundary 
                ? subString.substr(0, subString.lastIndexOf(' ')) 
                : subString) + "...";
    };

    // Polyfill util https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/assign#Polyfill
    if (typeof Object.assign != 'function') {
        Object.assign = function(target, varArgs) { // .length of function is 2
            'use strict';
            if (target == null) { // TypeError if undefined or null
                throw new TypeError('Cannot convert undefined or null to object');
            }

            var to = Object(target);

            for (var index = 1; index < arguments.length; index++) {
                var nextSource = arguments[index];

                if (nextSource != null) { // Skip over if undefined or null
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

    // dateformat youtube apiv3 to seconds http://stackoverflow.com/questions/22148885
    function convert_time(duration) {
        var a = duration.match(/\d+/g);

        if (duration.indexOf('M') >= 0 && duration.indexOf('H') == -1 && duration.indexOf('S') == -1) {
            a = [0, a[0], 0];
        }

        if (duration.indexOf('H') >= 0 && duration.indexOf('M') == -1) {
            a = [a[0], 0, a[1]];
        }
        if (duration.indexOf('H') >= 0 && duration.indexOf('M') == -1 && duration.indexOf('S') == -1) {
            a = [a[0], 0, 0];
        }

        duration = 0;

        if (a.length == 3) {
            duration = duration + parseInt(a[0]) * 3600;
            duration = duration + parseInt(a[1]) * 60;
            duration = duration + parseInt(a[2]);
        }

        if (a.length == 2) {
            duration = duration + parseInt(a[0]) * 60;
            duration = duration + parseInt(a[1]);
        }

        if (a.length == 1) {
            duration = duration + parseInt(a[0]);
        }
        return duration
    }

    // H:M:S
    function toHHMMSS(secs) {
        var sec_num = parseInt(secs, 10);   
        var hours   = Math.floor(sec_num / 3600) % 24;
        var minutes = Math.floor(sec_num / 60) % 60;
        var seconds = sec_num % 60;
        // return [hours,minutes,seconds];
        return '{hours}{minutes}{seconds}'.format({
            hours: (hours > 0 ? hours + "h " : ''),
            minutes: (minutes > 0 ? minutes + "min " : ''),
            seconds: (seconds > 0 ? seconds + "secs" : '')
        });
    }

    // {000,000,...}
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

    // URL format util http://stackoverflow.com/questions/1714786/
    function URLSerialize(obj, prefix) {
        var str = [], p;
        for(p in obj) {
            if (obj.hasOwnProperty(p)) {
                var k = prefix ? prefix + "[" + p + "]" : p, v = obj[p];
                str.push((v !== null && typeof v === "object") ?
                         URLSerialize(v, k) :
                         encodeURIComponent(k) + "=" + encodeURIComponent(v));
            }
        }
        return str.join("&");
    }

    // Plugin Methods
    var youtube = {
        config: {
            api: {
                url: "https://www.googleapis.com/youtube/v3/{path}?{fields}",
                key: config.yt_apikey || 0,
                maxresults: function() {
                    var mr = parseInt(config.yt_maxresults);
                    return (mr >= 1 && mr <= 50 ? mr : 1);
                }()
            },
            plugin: {
                regex: {
                    // !{command}[-{area}] [{text}]
                    cmd: /^\!(\w+)(?:\-(\w+))?(?:\s(.+))?/,
                    // {videId}
                    youtube: /(?:http|https)\:\/\/www\.(?:youtube\.com|youtu\.be)\/watch\?v\=([\w\-]+)/
                },
                command_trigger: config.command_trigger || 'youtube',
                catch_url: config.yt_catchurl,
                randomplay: config.yt_randomplay,
                yt_maxduration: config.yt_maxduration || 900,
                command_message: config.command_message || '[B]You[/B][COLOR=#ff0000]Tube[/COLOR] - Title: {title} - Link: [url={yt_link}]{yt_link}[/url] - By: {upload_by}',
                ytdl_action: parseInt(config.ytdl_action) || 0,
                ytdl_playback: parseInt(config.ytdl_playback) || 0,
                server_groups: config.command_permissionsServerGroups || []
            }
        },
        getJSON: function(options) {
            options = (typeof options !== "object") ? {} : options;

            options.method = options.method || 'GET';
            options.url = options.url || '';
            options.headers = options.headers || { 'Content-Type': 'application/json; charset=UTF-8' };
            options.callback = options.callback || function(err, res) { engine.log(res); };
            options.error_callback = options.error_callback || function(err, res) { engine.log(err); };

            /*
             TODO
              - [ENH] Port to new script engine
            */
            sinusbot.http({
                method: options.method,
                url: options.url,
                headers: options.headers
            }, function(err, res) {
                if (err || res.statusCode != 200) {
                    engine.log('Request error [{error}] Code: [{code}] Data: [{data}]'.format({
                        error: err,
                        data: res.data,
                        code: res.statusCode
                    }));
                    options.error_callback(err);
                } else {
                    // engine.log(res);
                    var json = JSON.parse(res.data);
                    options.callback(json);
                }
            });
        },
        api: {
            search: function(options) {
                options = (typeof options !== "object") ? {} : options;

                options.query = options.query || '';
                options.maxresults = options.maxresults || youtube.config.api.maxresults;
                options.type = options.type || 'video';
                options.fields = options.fields || 'items(snippet/title,snippet/description,snippet/channelTitle,id)';
                options.part = options.part || 'snippet';
                options.api_key = options.api_key || youtube.config.api.key;
                options.callback = options.callback || function(json) { engine.log(json); };
                options.error_callback = options.error_callback || function(error) { engine.log(error); };

                youtube.getJSON({
                    url: youtube.config.api.url.format({
                        path: 'search',
                        fields: URLSerialize({
                            q: options.query,
                            part: options.part,
                            type: options.type,
                            maxResults: options.maxresults,
                            fields: options.fields,
                            key: options.api_key
                        })
                    }),
                    callback: options.callback,
                    error_callback: options.error_callback
                });
            },
            video: function(options) {
                options = (typeof options !== "object") ? {} : options;

                options.videoId = options.videoId || 0;
                options.fields = options.fields || 'items(snippet/title,snippet/description,snippet/channelTitle,id,kind,statistics,contentDetails/duration)';
                options.part = options.part || 'snippet,statistics,contentDetails';
                options.api_key = options.api_key || youtube.config.api.key;
                options.callback = options.callback || function(json) { engine.log(json); };
                options.error_callback = options.error_callback || function(error) { engine.log(error); };

                youtube.getJSON({
                    url: youtube.config.api.url.format({
                        path: 'videos',
                        fields: URLSerialize({
                            id: options.videoId,
                            part: options.part,
                            fields: options.fields,
                            key: options.api_key
                        })
                    }),
                    callback: options.callback,
                    error_callback: options.error_callbacks
                });
            },
            searchWithDetails: function(options) {
                options = (typeof options !== "object") ? {} : options;

                options.query = options.query || '';
                options.maxresults = options.maxresults || youtube.config.api.maxresults;
                options.api_key = options.api_key || youtube.config.api.key;
                options.callback = options.callback || function(json) { engine.log(json); };
                options.search_callback = options.search_callback || false;
                options.error_callback = options.error_callback || function(error) { engine.log(error); };

                youtube.api.search({
                    query: options.query,
                    fields: 'items(id)',
                    maxresults: options.maxresults,
                    api_key: options.api_key,
                    callback: function(res) {
                        res.items.forEach(function(item) {
                            youtube.api.video({
                                videoId: item.id.videoId,
                                api_key: options.api_key,
                                callback: options.callback,
                                error_callback: options.error_callback
                            });
                        });
                        if (options.search_callback) {
                            options.search_callback(res);
                        }
                    },
                    error_callback: options.error_callback
                });
            }
        },
        msg: function(options) {
            options = (typeof options !== "object") ? {} : options;

            options.text = options.text || 'ravioli ravioli';
            options.mode = options.mode || 0;
            options.backend = options.backend || backend;
            options.client = options.client || false;
            options.channel = options.channel || false;

            var maxlength = 1000;

            /*
             TODO
             - [BUG] Make sure if works in all cases
            */
            switch(options.mode) {
                case 1: // Private client message
                    if (options.client) {
                        if (options.text.length >= maxlength) {
                            options.client.chat(options.text.trunc(maxlength));
                            options.text = options.text.slice(maxlength, options.text.length);
                            youtube.msg(options);
                        } else {
                            options.client.chat(options.text);
                        }
                    } else {
                        options.mode = 0;
                        youtube.msg(options);
                    }
                    break;
                case 2: // Channel message
                    if (options.channel) {
                        if (options.text.length > maxlength) {
                            options.channel.chat(options.text.trunc(maxlength));
                            options.text = options.text.slice(maxlength, options.text.length);
                            youtube.msg(options);
                        } else {
                            options.channel.chat(options.text);
                        }
                    } else {
                        options.mode = 0;
                        youtube.msg(options);
                    }
                    break;
                default: // Server message
                    if (options.text.length > maxlength) {
                        options.backend.chat(options.text.trunc(maxlength));
                        options.text = options.text.slice(maxlength, options.text.length);
                        youtube.msg(options);
                    } else {
                        options.backend.chat(options.text);
                    }
                    break;
                               }

        },
        commands: {
            'youtube': {
                syntax: 'Syntax: !{cmd}-[{valids}] <search string>',
                active: true,
                hidden: true,
                callback: function(data) {
                    data = (typeof data !== "object") ? {} : data;

                    youtube.api.searchWithDetails({
                        query: data.text,
                        callback: function(response) {
                            youtube.callbacks.video_message({
                                msg: data,
                                json: response
                            });
                        },
                        search_callback: function(res) {
                            if (data.mode === 2) { // only play if channel trigger
                                youtube.callbacks.video_playback(res);
                            }
                        },
                        error_callback: function(response) {
                            youtube.msg(Object.assign(data, {
                                text: "Search failed (Bad request)"
                            }));
                        }
                    });
                }
            },
            'test': {
                syntax: 'Syntax: !{cmd}-{par} <text>',
                active: true,
                hidden: false,
                callback: function(data) {
                    data = (typeof data !== "object") ? {} : data;

                    youtube.msg(data);
                    youtube.api.searchWithDetails({
                        query: data.text,
                        maxresults: 10,
                        callback: function(res) {
                            youtube.msg(Object.assign(data, {
                                text: '{video}'.format({
                                    video: res.items[0].snippet.title
                                })
                            }));
                        }
                    });
                }
            },
            'setkey': {
                syntax: 'Syntax !{cmd}-{par} <key>',
                active: true,
                hidden: false,
                callback: function(data) {
                    data = (typeof data !== "object") ? {} : data;
                    data.mode = 1;

                    // youtube.config.api.key = data.text;
                    // config.yt_apikey = youtube.config.api.key;

                    // engine.saveConfig(config);
                    youtube.msg(Object.assign(data, {
                        text: 'Api Key renewed to {key}'.format({
                            key:  youtube.config.api.key
                        })
                    }));
                }
            },
            getCommands: function() {
                var commands = [];
                Object.keys(youtube.commands).forEach(function(key) {
                    var command = youtube.commands[key];
                    if (command.active && !command.hidden) {
                        commands.push(key);
                    }
                });
                return commands || false;
            }
        },
        callbacks: {
            video_message: function(data) {
                data = (typeof data !== "object") ? {} : data;

                data.json = data.json || {};
                data.msg = data.msg || {};

                // Check for valid json response
                if ('items' in data.json && data.json.items.length > 0) {
                    var item = data.json.items[0];
                    var str_vars = [];

                    if ('snippet' in item && item.kind === 'youtube#video') {
                        var str_var = {
                            title: item.snippet.title,
                            description_complete: item.snippet.description,
                            description: item.snippet.description.trunc(160),
                            video_id: item.id,
                            yt_link: 'http://www.youtube.com/watch?v={0}'.format(item.id),
                            upload_by: item.snippet.channelTitle,
                            duration: toHHMMSS(convert_time(item.contentDetails.duration)),
                            commentCount: addCommas(item.statistics.commentCount),
                            viewCount: addCommas(item.statistics.viewCount),
                            likeCount: addCommas(item.statistics.likeCount),
                            dislikeCount: addCommas(item.statistics.dislikeCount),
                            favoriteCount: addCommas(item.statistics.favoriteCount)
                        };

                        // Send message
                        youtube.msg(Object.assign(data.msg, {
                            text: youtube.config.plugin.command_message.format(str_var)
                        }));
                    } else {
                        youtube.msg(Object.assign(data.msg, {
                            text: "Search failed (Invalid format response)"
                        }));
                        engine.log(data.json);
                    }
                } else {
                    youtube.msg(Object.assign(data.msg, {
                        text: "Search failed (Nothing found)"
                    }));
                }
            },
            video_playback: function(data) {
                data = (typeof data !== "object") ? {} : data;

                // check for valid json
                if ('items' in data && data.items.length > 0) {
                    var media = require('media');

                    var video = (youtube.config.plugin.randomplay ? data.items[Math.floor(Math.random() * data.items.length)] : data.items[0]);

                    var videoId = video.id.videoId || video.id;
                    var queue = (youtube.config.plugin.ytdl_playback === 0 ? true : false);

                    /*
                     {youtube.config.plugin.ytdl_action}
                      1: Download
                      2: Stream
                      0: Nothing
                    */
                    switch (youtube.config.plugin.ytdl_action) {
                        case 1: // Download
                            engine.log("Donwload: " + videoId);
                            media.ytdl(videoId, (queue ? false : true));
                            if (queue) {
                                engine.log("Append to queue: " + videoId);
                                // media.enqueueYt(videoId);
                                sinusbot.qyt(videoId);
                            }
                            break;
                        case 2: // Stream
                            if (queue) {
                                engine.log("Append to queue: " + videoId);
                                // media.enqueueYt(videoId);
                                sinusbot.qyt(videoId);
                            } else {
                                engine.log("Streaming: " + videoId);
                                media.yt(videoId);
                            }
                            break;
                        default: // Nothing
                            break;
                                                             }
                }
            }
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
        var group_permission = {
            config: youtube.config.plugin.server_groups.map(function(arr) {
                return arr.group;
            }),
            has_permission: function() {
                if (group_permission.config.length > 0) {
                    var has_permission = false;
                    client.getServerGroups().forEach(function(group) {
                        if ((!has_permission) && ((group_permission.config.indexOf(group.name()) > -1) || (group_permission.config.indexOf(group.id()) > -1))) {
                            has_permission = true;
                        }
                    });
                    return has_permission;
                } else {
                    return true;
                }
            }
        };
        if (!group_permission.has_permission()) return;

        var main_cmd = youtube.commands['youtube'];
        var msg = {
            mode: ev.mode,
            client: client,
            channel: channel
        };
        var cmd, par, text;
        // Regex text: !{command}[-{area}] {text}
        if ((text = youtube.config.plugin.regex.cmd.exec(ev.text)) !== null) {
            cmd = text[ 1 ].toLowerCase(); // command trigger
            par = text[ 2 ]; // command area
            text = text[ 3 ]; // args

            // Chat command equals to command trigger
            if (cmd === youtube.config.plugin.command_trigger.toLowerCase() && main_cmd.active) {
                // If have a sub-command
                if (par) {
                    par = par.toLocaleLowerCase();
                    // sub-command exists on script
                    if (par in youtube.commands) {
                        // Command have a callback function
                        if ('callback' in youtube.commands[ par ] && typeof youtube.commands[ par ].callback === 'function') {
                            var command = youtube.commands[ par ];

                            // Command is turned off
                            if (!command.active) return;

                            // If the command have a syntax to work
                            if (command.syntax) {
                                // check if chat have text
                                if (text) {
                                    command.callback(Object.assign({
                                        text: text
                                    }, msg));
                                    // No text pass return command syntax
                                } else {
                                    youtube.msg(Object.assign({
                                        text: command.syntax.format({
                                            cmd: cmd,
                                            par: par
                                        })
                                    }, msg));
                                }
                                // No syntax needed trigger commmand
                            } else {
                                command.callback(msg);
                            }
                            // Send message if not valid callback found
                        } else {
                            youtube.msg(Object.assign({
                                text: 'Invalid command !{cmd}-{par} not have a valid callback'.format({
                                    cmd: cmd,
                                    par: par
                                })
                            }, msg));
                        }
                        // Sub-command not exists, send valid list
                    } else {
                        youtube.msg(Object.assign({
                            text: 'Invalid command !{cmd}-{par}. Valid commands: !{cmd}-[{valids}]'.format({
                                cmd: cmd,
                                par: par,
                                valids: youtube.commands.getCommands()
                            })
                        }, msg));
                    }
                } else if (text) {
                    // trigger search {text}
                    main_cmd.callback(Object.assign({
                        text: text
                    }, msg));
                } else {
                    youtube.msg(Object.assign({
                        text: main_cmd.syntax.format({
                            cmd: cmd,
                            valids: youtube.commands.getCommands()
                        })
                    }, msg));
                }
            }
            // No command format found; check if a valid Youtube URL
        } else {
            var videoId;
            if (youtube.config.plugin.catch_url && (videoId = youtube.config.plugin.regex.youtube.exec(ev.text)) !== null) {
                videoId = videoId[ 1 ];
                // trigger search {videoId}
                youtube.api.video({
                    videoId: videoId,
                    callback: function(data) {
                        youtube.callbacks.video_message({
                            json: data,
                            msg: msg
                        });

                        if (msg.mode === 2) {
                            youtube.callbacks.video_playback(data);
                        }
                    },
                    error_callback: function(data) {
                        youtube.msg(Object.assign(msg, {
                            text: "Invalid request (Bad request)"
                        }));
                    }
                });
            }
        }
    });

    event.on('unload', function() {
        engine.log(config);
    });
});
