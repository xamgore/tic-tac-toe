'use strict';

let express = require('express'), app = express(),
    server = require('http').createServer(app),
    JsonRPC = require('eureca.io'),
    rpc = new JsonRPC.Server({ allow: ['updateGrid', 'updateRooms'] });


let rooms = {}, rooms_count = 0, room_names = [
    'Handshake', 'Null', 'SEGFAULT', 'Trojans', 'Recovery Fail!',
    'Floating Point', 'Panic', 'Logic Bomb', 'Deadlock', 'Rootkit'
], room_types = {
    default: { cell_count: 3, win_count: 3, players: 2 },
    bigger:  { cell_count: 5, win_count: 4, players: 2 },
    party:   { cell_count: 5, win_count: 3, players: 3 }
};

let users = {}, where_is_user = {}, users_count = 0, counter = 0; // id, clientProxy

function createRoom(type) {
    type = type || room_types.default;

    let id = rooms_count++;

    return rooms[id] = {
        id:      id,
        players: [],
        name:    room_names[counter++ % room_names.length],
        max:     type.players,
        type:    type,
        state:    {
            grid:       new Array(type.cell_count * type.cell_count).fill(0),
            cell_count: type.cell_count,
            win_count:  type.win_count,
            players:    type.players,
            turn:       0
        }
    };
}

function deleteRoom(id) {
    if (!id) return;

    let room = rooms[id];
    console.info(` deleteRoom(#${id}: ${room})`);

    let players = room.players;
    rooms[room.id].players = [];
    console.info(`  make players leave room`);

    if (players.length > 1) {
        delete rooms[room.id];
        console.info(`  delete room`);
    }

    generateRooms();
    let data = prepareRoomsDataForUser();

    players.forEach(p => {
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

function generateRooms() {
    Object.keys(room_types).forEach(t => createRoom(room_types[t]));

    let empty_rooms = Object.keys(rooms).map(id => rooms[id])
        .filter(room => room.players.length == 0);

    let filter = type => empty_rooms.filter(r => r.type == room_types[type]);

    Object.keys(room_types).map(filter).map(array => {
        array.shift();
        array.forEach(r => delete rooms[r.id]);
    });
}


rpc.onConnect(conn => {
    console.info(`user "${conn.socket.id}" connected`);

    users_count += 1;
    users[conn.id] = conn;

    generateRooms();
    notifyAllAboutRooms();
});

rpc.onDisconnect(conn => {
    console.info(`user "${conn.id}" disconnected`);
    users_count -= 1;

    delete users[conn.id];
    console.info(` he was in #${where_is_user[conn.id]} room`);
    deleteRoom(where_is_user[conn.id]);
});

function notifyAllAboutRooms() {
    let rooms = prepareRoomsDataForUser();
    Object.keys(users).forEach(id => users[id].clientProxy.updateRooms(rooms));
}

rpc.exports.notifyAllAboutRooms = notifyAllAboutRooms;

rpc.exports.getRooms = function() {
    console.info(`user ${this.socket.id} requested the list of rooms`);

    let rooms = prepareRoomsDataForUser();
    this.clientProxy.updateRooms(rooms);
};

rpc.exports.enterRoom = function (rid) {
    console.info(`user "${this.socket.id}" tries to enter #${rid} room`);

    if (!rooms.hasOwnProperty(rid)) {
        console.error(` room #${rid} was not found`);
        return { err: `room #${rid} was not found` };
    }

    let room = rooms[rid];
    if (room.players.length >= room.max) {
        console.error(` room #${rid} is busy (max is ${room.max})`);
        return { err: `room #${rid} is busy (max is ${room.max})` };
    }

    room.players.push(this);
    where_is_user[this.socket.id] = rid;

    console.info(` entered successfully!`);
    generateRooms();

    return room.state;
    // notify all from the client side
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
        deleteRoom(room);
    }
};


app.get('/', function (req, res, next) { res.sendfile('public/index.html') });
app.use(express.static('public'));
rpc.attach(server);
server.listen(8080);
