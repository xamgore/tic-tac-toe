'use strict';

let express = require('express'), app = express(),
    server = require('http').createServer(app),
    JsonRPC = require('eureca.io'),
    rpc = new JsonRPC.Server({ allow: ['updateGrid', 'updateRooms'] });


let rooms = {}, created_rooms = {}, rooms_count = 0, room_names = [
    'Handshake', 'Null', 'SEGFAULT', 'Trojans', 'Recovery Fail!',
    'Floating Point', 'Panic', 'Logic Bomb', 'Deadlock', 'Rootkit'
];

function createRoom(cell_count, win_count, max) {
    cell_count = cell_count || 3;
    win_count = win_count || 3;
    max = max || 2;

    let id = rooms_count++;

    return rooms[id] = {
        id:      id,
        players: [],
        name:    room_names[counter++ % room_names.length],
        max:     max,
        state:    {
            grid:       new Array(cell_count * cell_count).fill(0),
            cell_count: cell_count,
            win_count:  win_count,
            players:    max,
            turn:       0
        }
    };
}

function deleteRoom(room) {
    if (!room) return;

    let players = room.players;
    rooms[room.id].players = [];
    delete rooms[room.id];

    let data = prepareRoomsDataForUser();

    room.players.forEach(p => {
        // notify users to end the game
        p.clientProxy.updateRooms(data, true);
        delete where_is_user[p.socket.id];
    });
}

function prepareRoomsDataForUser() {
    return Object.keys(rooms)
        .map(id => rooms[id])
        // don't show full rooms
        .filter(room => room.players.length < room.max)
        .map(room => ({
            id:      room.id,
            name:    room.name,
            win:     room.state.win_count,
            size:    room.state.cell_count,
            players: `${room.players.length}/${room.max}`
        }));
}



let users = {}, where_is_user = {}, users_count = 0, counter = 0; // id, clientProxy

rpc.onConnect(conn => {
    users_count += 1;
    users[conn.id] = conn;

    created_rooms[conn.id] = [createRoom(3, 3, 2), createRoom(5, 4, 2)];
    if (users_count / 4 >= 1)
        created_rooms[conn.id].push(createRoom(5, 3, 3));

    notifyAllAboutRooms();
});

rpc.onDisconnect(conn => {
    users_count -= 1;

    // delete empty rooms, created by user
    created_rooms[conn.id].forEach(r => {
        if (!r.players.length)
            delete rooms[r.id];
    });

    delete created_rooms[conn.id];
    delete users[conn.id];

    // notify users to end game
    deleteRoom(where_is_user[conn.id]);
});

function notifyAllAboutRooms() {
    let rooms = prepareRoomsDataForUser();
    Object.keys(users).forEach(id => users[id].clientProxy.updateRooms(rooms));
}

rpc.exports.notifyAllAboutRooms = notifyAllAboutRooms;

rpc.exports.getRooms = function() {
    let rooms = prepareRoomsDataForUser();
    this.clientProxy.updateRooms(rooms);
};

rpc.exports.enterRoom = function (rid) {
    if (!rooms.hasOwnProperty(rid))
        return { err: 'room was not found'};

    let room = rooms[rid];
    if (room.players.length >= room.max)
        return { err: 'room is busy' };

    room.players.push(this);
    where_is_user[this.socket.id] = rid;

    return room.state;
};

rpc.exports.makeMove = function (i, j) {
    let playerId = this.socket.id,
        room = rooms[where_is_user[playerId]],
        state = room.state;

    let get = (i, j) => state.grid[j * state.cell_count + i],
        set = (i, j, val) => state.grid[j * state.cell_count + i] = val;

    if (get(i, j) !== 0)
        return { err: 'cell is busy' };

    let turnId = state.turn % room.max;

    // it's not the turn of the player
    if (turnId >= room.players.length || room.players[turnId].socket.id !== playerId)
         return { err: 'not your turn' };

    let figure = state.turn++ % room.max + 1;

    set(i, j, figure);
    room.players.forEach(p => p.clientProxy.updateGrid(state.grid, figure));

    let checkVictory = who => {
        let iterate = getter => {
            for (let i = 0; i < state.win_count; i++)
                if (getter(i) != who)
                    return false;
            return true;
        };

        let row, col, path = {
            vertical: _ => iterate(i => get(row + i, col)),
            horizntl: _ => iterate(j => get(col, row + j)),
            diagonal: _ => iterate(i => get(row + i, col + i)),
            opposite: _ => iterate(i => get(row + i, col + state.win_count - 1 - i)),
        };

        for (row = 0; row <= state.cell_count - state.win_count; row++) {
            for (col = 0; col < state.cell_count; col++)
                if (path.vertical() || path.horizntl())
                    return true;

            for (col = 0; col <= state.cell_count - state.win_count; col++)
                if (path.diagonal() || path.opposite())
                    return true;
        }

        return false;
    };

    // game is over, delete room
    if (checkVictory(figure)) {
        let another = createRoom(room.cell_count, room.win_count, room.max);
        created_rooms[room.players[0].socket.id] = another;
        deleteRoom(room);
    }
};


app.get('/', function (req, res, next) { res.sendfile('public/index.html') });
app.use(express.static('public'));
rpc.attach(server);
server.listen(8080);
