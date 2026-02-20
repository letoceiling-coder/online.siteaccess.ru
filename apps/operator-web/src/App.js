"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
var react_1 = require("react");
var socket_io_client_1 = require("socket.io-client");
require("./App.css");
var API_URL = 'https://online.siteaccess.ru';
var WS_URL = 'https://online.siteaccess.ru';
function App() {
    var _this = this;
    var _a = (0, react_1.useState)(''), channelId = _a[0], setChannelId = _a[1];
    var _b = (0, react_1.useState)(localStorage.getItem('operator_dev_token') || ''), devToken = _b[0], setDevToken = _b[1];
    var _c = (0, react_1.useState)(false), connected = _c[0], setConnected = _c[1];
    var _d = (0, react_1.useState)([]), conversations = _d[0], setConversations = _d[1];
    var _e = (0, react_1.useState)(null), selectedConversation = _e[0], setSelectedConversation = _e[1];
    var _f = (0, react_1.useState)([]), messages = _f[0], setMessages = _f[1];
    var _g = (0, react_1.useState)(''), messageInput = _g[0], setMessageInput = _g[1];
    var _h = (0, react_1.useState)(null), socket = _h[0], setSocket = _h[1];
    var _j = (0, react_1.useState)(0), onlineVisitors = _j[0], setOnlineVisitors = _j[1];
    var _k = (0, react_1.useState)(null), error = _k[0], setError = _k[1];
    (0, react_1.useEffect)(function () {
        if (devToken) {
            localStorage.setItem('operator_dev_token', devToken);
        }
    }, [devToken]);
    var handleConnect = function () { return __awaiter(_this, void 0, void 0, function () {
        var response, data, ws, err_1;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    if (!channelId || !devToken) {
                        setError('Please enter Channel ID and Dev Token');
                        return [2 /*return*/];
                    }
                    setError(null);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("".concat(API_URL, "/api/operator/dev/conversations?channelId=").concat(channelId), {
                            headers: {
                                'x-operator-dev-token': devToken,
                            },
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error('Failed to fetch conversations');
                    }
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _a.sent();
                    setConversations(data);
                    setConnected(true);
                    ws = (0, socket_io_client_1.io)("".concat(WS_URL, "/operator"), {
                        auth: { devToken: devToken, channelId: channelId },
                        transports: ['websocket', 'polling'],
                    });
                    ws.on('connect', function () {
                        console.log('Operator connected');
                    });
                    ws.on('message:new', function (data) {
                        if (data.conversationId === selectedConversation) {
                            setMessages(function (prev) { return __spreadArray(__spreadArray([], prev, true), [data], false); });
                        }
                        // Update conversation list
                        setConversations(function (prev) {
                            return prev.map(function (conv) {
                                return conv.conversationId === data.conversationId
                                    ? __assign(__assign({}, conv), { lastMessageText: data.text, updatedAt: new Date().toISOString() }) : conv;
                            });
                        });
                    });
                    ws.on('presence:update', function (data) {
                        if (data.channelId === channelId) {
                            setOnlineVisitors(data.onlineVisitors || 0);
                        }
                    });
                    ws.on('message:ack', function (data) {
                        console.log('Message ACK:', data);
                    });
                    setSocket(ws);
                    return [3 /*break*/, 5];
                case 4:
                    err_1 = _a.sent();
                    setError(err_1.message || 'Connection failed');
                    setConnected(false);
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleSelectConversation = function (conversationId) { return __awaiter(_this, void 0, void 0, function () {
        var response, data, err_2;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    setSelectedConversation(conversationId);
                    setMessages([]);
                    _a.label = 1;
                case 1:
                    _a.trys.push([1, 4, , 5]);
                    return [4 /*yield*/, fetch("".concat(API_URL, "/api/operator/dev/messages?conversationId=").concat(conversationId, "&limit=50"), {
                            headers: {
                                'x-operator-dev-token': devToken,
                            },
                        })];
                case 2:
                    response = _a.sent();
                    if (!response.ok) {
                        throw new Error('Failed to fetch messages');
                    }
                    return [4 /*yield*/, response.json()];
                case 3:
                    data = _a.sent();
                    setMessages(data);
                    return [3 /*break*/, 5];
                case 4:
                    err_2 = _a.sent();
                    setError(err_2.message || 'Failed to load messages');
                    return [3 /*break*/, 5];
                case 5: return [2 /*return*/];
            }
        });
    }); };
    var handleSendMessage = function () {
        if (!messageInput.trim() || !socket || !selectedConversation)
            return;
        var clientMessageId = "op-".concat(Date.now(), "-").concat(Math.random().toString(36).substr(2, 9));
        socket.emit('message:send', {
            conversationId: selectedConversation,
            text: messageInput.trim(),
            clientMessageId: clientMessageId,
        });
        // Add to local messages immediately
        setMessages(function (prev) { return __spreadArray(__spreadArray([], prev, true), [
            {
                serverMessageId: clientMessageId,
                text: messageInput.trim(),
                senderType: 'operator',
                createdAt: new Date().toISOString(),
            },
        ], false); });
        setMessageInput('');
    };
    return (<div className="app">
      {!connected ? (<div className="connect-panel">
          <h1>Operator Web - Dev Mode</h1>
          <div className="form-group">
            <label>Channel ID:</label>
            <input type="text" value={channelId} onChange={function (e) { return setChannelId(e.target.value); }} placeholder="Enter channel ID"/>
          </div>
          <div className="form-group">
            <label>Dev Token:</label>
            <input type="password" value={devToken} onChange={function (e) { return setDevToken(e.target.value); }} placeholder="Enter OPERATOR_DEV_TOKEN"/>
          </div>
          {error && <div className="error">{error}</div>}
          <button onClick={handleConnect} className="connect-btn">
            Connect
          </button>
        </div>) : (<div className="operator-panel">
          <div className="sidebar">
            <div className="sidebar-header">
              <h2>Conversations</h2>
              <div className="online-count">Online: {onlineVisitors}</div>
            </div>
            <div className="conversations-list">
              {conversations.map(function (conv) { return (<div key={conv.conversationId} className={"conversation-item ".concat(selectedConversation === conv.conversationId ? 'active' : '')} onClick={function () { return handleSelectConversation(conv.conversationId); }}>
                  <div className="conversation-visitor">{conv.visitorExternalId}</div>
                  <div className="conversation-preview">
                    {conv.lastMessageText || 'No messages'}
                  </div>
                  <div className="conversation-time">
                    {new Date(conv.updatedAt).toLocaleString()}
                  </div>
                </div>); })}
              {conversations.length === 0 && (<div className="empty-state">No conversations</div>)}
            </div>
          </div>
          <div className="chat-area">
            {selectedConversation ? (<>
                <div className="chat-header">
                  <h3>Chat</h3>
                </div>
                <div className="messages-container">
                  {messages.map(function (msg) { return (<div key={msg.serverMessageId} className={"message ".concat(msg.senderType)}>
                      <div className="message-text">{msg.text}</div>
                      <div className="message-time">
                        {new Date(msg.createdAt).toLocaleTimeString()}
                      </div>
                    </div>); })}
                </div>
                <div className="chat-input-container">
                  <input type="text" value={messageInput} onChange={function (e) { return setMessageInput(e.target.value); }} onKeyPress={function (e) { return e.key === 'Enter' && handleSendMessage(); }} placeholder="Type a message..." className="chat-input"/>
                  <button onClick={handleSendMessage} className="send-btn">
                    Send
                  </button>
                </div>
              </>) : (<div className="no-selection">Select a conversation to start chatting</div>)}
          </div>
        </div>)}
    </div>);
}
exports.default = App;
