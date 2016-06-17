let players = 3, cell_count = 4, win_count = 4,
    cell_size = 100, size = cell_size * cell_count,
    canvas = $('#canvas').attr({ width: size, height: size }),
    ctx = canvas[0].getContext('2d');

ctx.imageSmoothingEnabled = false;
ctx.lineWidth = 3;


function clear() {
    ctx.clearRect(0, 0, size, size);
}

function line(x, y, w, h, color = '#ccc') {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + w, y + h);
    ctx.strokeStyle = color;
    ctx.stroke();
    ctx.closePath();
}

function fillRect(i, j, color = '#F5F5F5') {
    ctx.fillStyle = color;
    ctx.fillRect(i * cell_size, j * cell_size, cell_size, cell_size);
}

var draw = {
    grid: (color = '#ccc') => {
        for (let i = 1; i < cell_count; i++) {
            line(cell_size * i, 0, 0, size, color);
            line(0, cell_size * i, size, 0, color);
        }
    },

    // draw nothing, stub
    0: (i, j, _) => {},

    // draw X figure
    1: (i, j, color = '#3F51B5') => {
        let left = (i + 0.1) * cell_size,
            top = (j + 0.1) * cell_size,
            size = 0.8 * cell_size;

        line(left, top, size, size, color);
        line(left + size, top, -size, size, color);
    },

    // draw O figure
    2: (i, j, color = '#FF5722') => {
        ctx.beginPath();
        ctx.arc((i + 0.5) * cell_size, (j + 0.5) * cell_size, 0.4 * cell_size, 0, Math.PI * 2, false);
        ctx.strokeStyle = color;
        ctx.stroke();
        ctx.closePath();
    },

    // draw Δ figure
    3: (i, j, color = '#FDE619'/*'#FFEB3B'*/) => {
        let center = (i + 0.5) * cell_size,
            size = Math.sqrt(3) * 0.525 * cell_size,
            top = (j + 0.125) * cell_size,
            height = 0.75 * cell_size,
            step = size / 2;

        line(center, top, -step, height, color);
        line(center, top, step, height, color);
        line(center - step, top + height, size, 0, color);
    }
};


let grid = new Array(cell_count * cell_count).fill(0),
    get = (i, j) => grid[j * cell_count + i],
    set = (i, j, val = 0) => grid[j * cell_count + i] = val,
    isFree = (i, j) => get(i, j) === 0;

function drawFigures() {
    for (let i = 0; i < cell_count; i++) {
        for (let j = 0; j < cell_count; j++)
            draw[get(i, j)](i, j);
    }
}

function checkVictory(who) {
    let iterate = getter => {
        for (let i = 0; i < win_count; i++)
            if (getter(i) != who)
                return false;
        return true;
    };

    let row, col, path = {
        vertical: _ => iterate(i => get(row + i, col)),
        horizntl: _ => iterate(j => get(col, row + j)),
        diagonal: _ => iterate(i => get(row + i, col + i)),
        opposite: _ => iterate(i => get(row + i, col + win_count - 1 - i)),
    };

    for (row = 0; row <= cell_count - win_count; row++) {
        for (col = 0; col < cell_count; col++) {
            if (path.vertical()) return ['vertical', row, col];
            if (path.horizntl()) return ['horizntl', col, row];
        }

        for (col = 0; col <= cell_count - win_count; col++) {
            if (path.diagonal()) return ['diagonal', row, col];
            if (path.opposite()) return ['opposite', row, col];
        }
    }

    return [];
}

function onWin([type, row, col]) {
    if (!type) return;

    let iterate = action => {
        for (let i = 0; i < win_count; i++) action(i);
    };

    let drawSequence = {
        vertical: _ => iterate(i => fillRect(row + i, col)),
        horizntl: _ => iterate(j => fillRect(row, col + j)),
        diagonal: _ => iterate(i => fillRect(row + i, col + i)),
        opposite: _ => iterate(i => fillRect(row + i, col + win_count - 1 - i)),
    };

    clear();
    drawSequence[type]();
    draw.grid();

    for (let i = 0; i < cell_count; i++) {
        for (let j = 0; j < cell_count; j++)
            draw[get(i, j)](i, j);
    }

    return true;
}


let server, client = new Eureca.Client();

function listen(s = server) {
    server = s;

    let inGame = false, gameOver = false;

    client.exports.updateGrid = (new_grid, figure) => {
        if (!inGame) return;

        grid = new_grid;

        clear();
        draw.grid();
        drawFigures();

        if (onWin(checkVictory(figure)))
            gameOver = true;
    };

    let startGame = (state) => {
        // something went wrong, try again
        if (state.err) return console.log(state.err), server.getRooms();
        server.notifyAllAboutRooms();

        // show canvas
        $('.menu').hide();
        $('#game').show();

        inGame = true;
        gameOver = false;

        // init game state
        players = state.players;
        cell_count = state.cell_count;
        win_count = state.win_count;
        size = cell_size * cell_count;

        canvas.attr({ width: size, height: size })
            .click(e => {
                if (gameOver) {
                    inGame = false;
                    return server.getRooms();
                }

                server.makeMove(e.offsetX / cell_size | 0, e.offsetY / cell_size | 0)
                    .onReady(res => console.log(res));
            });

        draw.grid();
    };

    client.exports.updateRooms = (rooms, forceUpdate) => {
        if (inGame && !forceUpdate) return;

        if ($('.spinner').length) {
            $('.spinner').fadeOut(1000, function() {
                $(this).remove();
                $('.menu').show();
            });
        } else {
            $('#game').hide();
            $("#menu").show();
        }

        let showInfo = room => `<div><a id="${ room.id }">${ room.players }</a>&nbsp;${ room.name }
                    <span>&nbsp;${room.size}×${room.size}, ${room.win} to win&nbsp;</span></div>`;

        $('#menu').html(rooms.map(showInfo).join(''));

        let enterRoom = id => {
            console.log(`Trying to enter #${id} room`);
            server.enterRoom(id).onReady(startGame);
        };

        $('#menu div').click(e => enterRoom( $(e.currentTarget).children('a').attr('id') ));
    };
}

client.onConnect(() => listen());
client.ready(listen);
