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
            name: 'yt_titleblacklist',
            title: 'Banned video titles <comma saparated>',
            type: 'string',
            placeholder: '10 hours, ...'
        },
        {
            name: 'command_adminpermissions',
            title: 'Admin users (ID or Name)',
            type: 'array',
            vars: [
                {
                    name: 'user',
                    type: 'string',
                    indent: 2,
                    placeholder: 'Username or id'
                }
            ]
        },
        {
            name: 'command_blacklistusers',
            title: 'Banned users <comma saparated> ',
            type: 'string',
            placeholder: 'trollface, <id/username>...'
        },
        {
            name: 'command_permissionsServerGroups',
            title: 'List of server groups that the bot should accept command and links (ID or Name)',
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
                yt_titleblacklist: (typeof config.yt_titleblacklist !== 'undefined' && config.yt_titleblacklist.length > 0 ? config.yt_titleblacklist.split(',') : []),
                command_message: config.command_message || '[B]You[/B][COLOR=#ff0000]Tube[/COLOR] - Title: {title} - Link: [url={yt_link}]{yt_link}[/url] - By: {upload_by}',
                ytdl_action: parseInt(config.ytdl_action) || 0,
                ytdl_playback: parseInt(config.ytdl_playback) || 0,
                server_groups: config.command_permissionsServerGroups || [],
                adminpermissions: config.command_adminpermissions || [],
                blacklistusers: (typeof config.command_blacklistusers !== 'undefined' && config.command_blacklistusers.length > 0 ? config.command_blacklistusers.split(',') : [])
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
            var timeoutdelay = 125;

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
                            setTimeout(function() {
                                youtube.msg(options)
                            }, timeoutdelay);
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
                            setTimeout(function() {
                                youtube.msg(options)
                            }, timeoutdelay);
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
                        setTimeout(function() {
                            youtube.msg(options)
                        }, timeoutdelay);
                    } else {
                        options.backend.chat(options.text);
                    }
                    break;
                               }

        },
        commands: {
            'youtube': {
                syntax: 'Syntax: !{cmd}-[{valids}] <text>',
                active: true,
                hidden: true,
                admin: false,
                callback: function(data) {
                    data = (typeof data !== "object") ? {} : data;

                    var msg = function(text) {
                        youtube.msg(Object.assign(data, {
                            text: text
                        }));
                    };

                    var error_callback = function(error) {
                        msg("Search failed (Bad request)");
                        engine.log(error);
                    };

                    youtube.api.search({
                        query: data.text,
                        fields: 'items(id)',
                        callback: function(search) {
                            search = (typeof search !== "object") ? {} : search;
                            search.items = search.items || [];

                            if (search.items.length <= 0) {
                                msg("Search failed (Nothing found)");
                            } else {
                                var playback = false;
                                var items = search.items;

                                items.forEach(function(item) {
                                    item = (typeof item !== "object") ? {} : item;
                                    item.id = item.id || {};
                                    item.id.videoId = item.id.videoId || 0;
                                    item.id.kind = item.id.kind || 'default';

                                    youtube.api.video({
                                        videoId: item.id.videoId,
                                        callback: function(video) {
                                            var probability = youtube.config.plugin.randomplay ? (Math.random() >= ( 1.0 - (1/items.length) ) ) : true;

                                            youtube.callbacks.video_message({
                                                msg: data,
                                                video: video
                                            });

                                            if (!playback && items[items.length - 1].id.videoId === video.items[ 0 ].id) {
                                                if (youtube.callbacks.video_playback({ video: video })) {
                                                    playback = true;
                                                } else {
                                                    youtube.msg(Object.assign(data, {
                                                        text: 'Could not play video with filters set',
                                                        mode: 1
                                                    }));
                                                }
                                            } else if (!playback && probability) {
                                                if (youtube.callbacks.video_playback({ video: video })) {
                                                    playback = true;
                                                }
                                            }
                                        },
                                        error_callback: error_callback
                                    });
                                });
                            }
                        },
                        error_callback: error_callback
                    });
                }
            },
            'video': {
                syntax: 'Syntax !{cmd}-{par} <video-id/link>',
                active: true,
                hidden: false,
                admin: false,
                callback: function(data) {
                    var msg = function(text) {
                        youtube.msg(Object.assign(data, {
                            text: text
                        }));
                    };

                    var videoid = youtube.config.plugin.regex.youtube.exec(data.text) || data.text;

                    youtube.api.video({
                        videoId: (typeof videoid === 'object' ? videoid[ 1 ] : videoid ),
                        callback: function(video) {
                            youtube.callbacks.video_message({
                                msg: data,
                                video: video
                            });
                        },
                        error_callback: function(err) {
                            msg("Search failed (Bad request)");
                        }
                    });
                }
            },
            'about': {
                syntax: false,
                active: true,
                hidden: false,
                admin: false,
                callback: function(data) {
                    youtube.msg(Object.assign(data, {
                        text: 'Youtube Search script v{version} by {author}'.format({
                            version: '1.2.3',
                            author: 'NT5'
                        })
                    }));
                }
            },
            'setkey': {
                syntax: 'Syntax !{cmd}-{par} <key>',
                active: true,
                hidden: false,
                admin: true,
                callback: function(data) {
                    data = (typeof data !== "object") ? {} : data;
                    data.mode = 1;

                    var old_key = youtube.config.api.key;

                    youtube.config.api.key = data.text;
                    config.yt_apikey = youtube.config.api.key;
                    engine.saveConfig(config);

                    youtube.msg(Object.assign(data, {
                        text: 'Api Key renewed from {old_key} to {key}'.format({
                            key:  youtube.config.api.key,
                            old_key: old_key
                        })
                    }));
                }
            },
            'reset': {
                syntax: 'Syntax !{cmd}-{par} {botname}',
                active: true,
                hidden: false,
                admin: true,
                callback: function(data) {
                    var msg = function(text) {
                        youtube.msg(Object.assign(data, {
                            text: text
                        }));  
                    };
                    var bot = backend.getBotClient();

                    if (data.text === bot.name()) {
                        config = {};
                        engine.saveConfig(config);
                        if (!engine.reloadScripts()) {
                            msg('Can\'t reload script because its disabled in config.ini');
                        }
                        msg('All configuration reset to default. If not take effect make sure do you have activate "AllowReload" on your config.ini or reload it manually');
                    } else {
                        msg('You should type the bot name to reset settings');
                    }
                }
            },
            'test': {
                syntax: false,
                active: true,
                hidden: true,
                admin: true,
                callback: function(data) {
                    data = (typeof data !== "object") ? {} : data;

                    youtube.msg(Object.assign(data, {
                        text: '{0}'.format(backend.getBotClient().uniqueID())
                    }));

                    engine.log(config);
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

                data.video = data.video || {};
                data.msg = data.msg || {};

                var msg = function(text) {
                    youtube.msg(Object.assign(data.msg, {
                        text: text
                    }));  
                };

                data.video.items = data.video.items || [];

                data.video.items.forEach(function(item) {
                    item = (typeof item !== "object") ? {} : item;
                    item.kind = item.kind || 'default';
                    item.id = item.id || 0;

                    item.snippet = item.snippet || {};
                    item.snippet.title = item.snippet.title || 'no video';
                    item.snippet.description = item.snippet.description || 'no video';
                    item.snippet.channelTitle = item.snippet.channelTitle || 'no video';

                    item.contentDetails = item.contentDetails || {};
                    item.contentDetails.duration = item.contentDetails.duration || '0S';

                    item.statistics = item.statistics || {};
                    item.statistics.commentCount = item.statistics.commentCount || 0;
                    item.statistics.viewCount = item.statistics.viewCount || 0;
                    item.statistics.likeCount = item.statistics.likeCount || 0;
                    item.statistics.dislikeCount = item.statistics.dislikeCount || 0;
                    item.statistics.favoriteCount = item.statistics.favoriteCount || 0;

                });

                if (data.video.items.length > 0) {
                    var item = data.video.items[ 0 ];
                    var str_vars = [];

                    if (item.kind === 'youtube#video') {
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
                        msg(youtube.config.plugin.command_message.format(str_var));
                    } else {
                        msg("Search failed (Invalid type)");
                        engine.log(data.video);
                    }
                } else {
                    msg("Search failed (Nothing found)");
                }
            },
            video_playback: function(data) {
                data = (typeof data !== "object") ? {} : data;

                data.video = data.video || {};
                data.video.items = data.video.items || [];

                data.video.items.forEach(function(item) {
                    item = (typeof item !== "object") ? {} : item;
                    item.kind = item.kind || 'default';
                    item.id = item.id || 0;
                    item.snippet = item.snippet || {};
                    item.snippet.title = item.snippet.title || 'no video';
                    item.contentDetails = item.contentDetails || {};
                    item.contentDetails.duration = item.contentDetails.duration || '0S';
                });

                // check for valid json
                if (data.video.items.length > 0) {
                    var media = require('media');

                    var video = data.video.items[ 0 ];

                    var playable = {
                        title: function() {
                            var video_title = video.snippet.title.toLowerCase();
                            var blacklist = false;
                            youtube.config.plugin.yt_titleblacklist.forEach(function(word) {
                                if (!blacklist && video_title.indexOf(word.toLowerCase()) !== -1) {
                                    blacklist = true;
                                }
                            });
                            return (blacklist ? false : true);
                        },
                        duration: function() {
                            var video_duration = convert_time(video.contentDetails.duration);
                            if (video_duration <= youtube.config.plugin.yt_maxduration) return true;
                            return false;
                        }
                    };
                    if (!playable.title() || !playable.duration()) return false;

                    var videoId = video.id;
                    var queue = (youtube.config.plugin.ytdl_playback === 0 ? true : false);

                    /*
                     {youtube.config.plugin.ytdl_action}
                      1: Download
                      2: Stream
                      0: Nothing
                    */
                    switch (youtube.config.plugin.ytdl_action) {
                        case 1: // Download
                            if(media.ytdl(videoId, (queue ? false : true))) {
                                engine.log("Donwload: " + videoId);
                            } else {
                                engine.log("Can't download: " + videoId);
                            }
                            if (queue) {
                                // media.enqueueYt(videoId);
                                if (sinusbot.qyt(videoId)) {
                                    engine.log("Append to queue: " + videoId);
                                } else {
                                    engine.log("Cannot enqueue: " + videoId);
                                }
                            }
                            return true;
                            break;
                        case 2: // Stream
                            if (queue) {
                                // media.enqueueYt(videoId);
                                if (sinusbot.qyt(videoId)) {
                                    engine.log("Append to queue: " + videoId);
                                } else {
                                    engine.log("Cannot enqueue: " + videoId);
                                }
                            } else {
                                if (media.yt(videoId)) {
                                    engine.log("Streaming: " + videoId);
                                } else {
                                    engine.log("Can't Streaming: " + videoId); 
                                }
                            }
                            return true;
                            break;
                        default: // Nothing
                            return true;
                            break;
                                                             }
                }
                return false;
            }
        }
    };

    // Chat event
    event.on('chat', function(ev) {
        var client = ev.client;
        var channel = ev.channel;
        var bot = backend.getBotClient();

        if (client.isSelf()) return;

        // Check for valid groups
        /*
         TODO
         - [ENH] Better way to split groups
         - [BUG] Make sure if works in all cases
        */
        var permission = {
            config: {
                group: youtube.config.plugin.server_groups.map(function(arr) {
                    return arr.group;
                }),
                client: youtube.config.plugin.adminpermissions.map(function(arr) {
                    return arr.user;
                }),
                banned: youtube.config.plugin.blacklistusers
            },
            group: {
                has_permission: function() {
                    if (permission.config.group.length > 0) {
                        var has_permission = false;
                        client.getServerGroups().forEach(function(group) {
                            if ((!has_permission) && ((permission.config.group.indexOf(group.name()) > -1) || (permission.config.group.indexOf(group.id()) > -1))) {
                                has_permission = true;
                            }
                        });
                        return has_permission;
                    }
                    return true;
                } 
            },
            client: {
                is_banned: function() {
                    if (permission.config.banned.length > 0) {
                        if ((permission.config.banned.indexOf(client.name()) > -1) || (permission.config.banned.indexOf(client.uniqueID()) > -1))
                            return true;
                    }
                    return false;
                },
                is_admin: function() {
                    if (permission.config.client.length > 0) {
                        if ((permission.config.client.indexOf(client.name()) > -1) || (permission.config.client.indexOf(client.uniqueID()) > -1))
                            return true;
                    }
                    return false;
                }
            }
        };
        if (!permission.group.has_permission()) return;
        if (permission.client.is_banned()) return;

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

                            if (command.admin && !permission.client.is_admin()) {
                                youtube.msg(Object.assign(msg, {
                                    text: 'You not have enough permissions'
                                }));
                                return;
                            }

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
                                            par: par,
                                            botname: bot.name()
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
                            video: data,
                            msg: msg
                        });

                        if (msg.mode === 2) {
                            youtube.callbacks.video_playback({
                                video: data
                            });
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
