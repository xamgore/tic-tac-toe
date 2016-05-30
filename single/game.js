'use strict';

let players = 3, cell_count = 4, winCount = 4,
    cell_size = 100, size = cell_size * cell_count,
    canvas = $('#canvas').attr({ width: size, height: size }),
    ctx = canvas[0].getContext('2d');

ctx.imageSmoothingEnabled = false;
ctx.lineWidth = 3;


function clear() {
    ctx.clearRect(0, 0, canvas.width(), canvas.height());
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
    isFree = (i, j) => get(i, j) == 0,

    checkVictory = (who) => {
        let iterate = getter => {
            for (let i = 0; i < winCount; i++)
                if (getter(i) != who)
                    return false;
            return true;
        };

        let row, col, path = {
            vertical: _ => iterate(i => get(row + i, col)),
            horizntl: _ => iterate(j => get(col, row + j)),
            diagonal: _ => iterate(i => get(row + i, col + i)),
            opposite: _ => iterate(i => get(row + i, col + winCount - 1 - i)),
        };

        for (row = 0; row <= cell_count - winCount; row++) {
            for (col = 0; col < cell_count; col++) {
                if (path.vertical()) return ['vertical', row, col];
                if (path.horizntl()) return ['horizntl', col, row];
            }

            for (col = 0; col <= cell_count - winCount; col++) {
                if (path.diagonal()) return ['diagonal', row, col];
                if (path.opposite()) return ['opposite', row, col];
            }
        }

        return [];
    },

    onWin = ([type, row, col]) => {
        if (!type) return;

        let iterate = action => {
            for (let i = 0; i < winCount; i++) action(i);
        };

        let drawSequence = {
            vertical: _ => iterate(i => fillRect(row + i, col)),
            horizntl: _ => iterate(j => fillRect(row, col + j)),
            diagonal: _ => iterate(i => fillRect(row + i, col + i)),
            opposite: _ => iterate(i => fillRect(row + i, col + winCount - 1 - i)),
        };

        clear();
        drawSequence[type]();
        draw.grid();

        for (let i = 0; i < cell_count; i++) {
            for (let j = 0; j < cell_count; j++)
                draw[get(i, j)](i, j);
        }

        return true;
    };


let playerTurn = 0;

canvas.click(e => {
    let i = e.offsetX / cell_size | 0,
        j = e.offsetY / cell_size | 0;

    if (isFree(i, j)) {
        let figure = playerTurn++ % players + 1;

        set(i, j, figure);
        draw[figure](i, j);
        onWin(checkVictory(figure)) && canvas.off('click');
    }
});

draw.grid();
