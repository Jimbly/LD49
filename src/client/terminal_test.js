/*eslint global-require:off, no-use-before-define:["error", { "functions": false }]*/
const local_storage = require('glov/client/local_storage.js');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

const engine = require('glov/client/engine.js');
// const input = require('glov/client/input.js');
const net = require('glov/client/net.js');
const { ansi, terminalCreate } = require('glov/client/terminal.js');
const { terminalSettingsInit, terminalSettingsShow } = require('glov/client/terminal_settings.js');
const ui = require('glov/client/ui.js');


window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
const game_width = 720;
const game_height = 400;

export function main() {
  if (engine.DEBUG) {
    // Enable auto-reload, etc
    net.init({ engine });
  }

  if (!engine.startup({
    game_width,
    game_height,
    pixely: 'strict',
    viewport_postprocess: true,
    font: {
      info: require('./img/font/vga_16x1.json'),
      texture: 'font/vga_16x1',
    },
    pixel_aspect: (640/480) / (720 / 400),
    show_fps: false,
  })) {
    return;
  }

  const terminal = terminalCreate({
    z: Z.BACKGROUND + 1,
  });
  // const font = engine.font;

  // Perfect sizes for pixely modes
  ui.scaleSizes(13 / 32);
  ui.setFontHeight(16);

  // Cache KEYS
  // const KEYS = input.KEYS;

  const MENU_W = 20;
  const MENU_X = (80 - MENU_W) / 2;
  const MENU_Y = 5;
  function menu(dt) {
    let sel = terminal.menu({
      x: MENU_X,
      y: 5,
      items: [
        'Something ',
        `${ansi.yellow.bright('[O]')}ptions `,
      ],
    });

    switch (sel) { // eslint-disable-line default-case
      case 0:
        // do something
        break;
      case 1:
        terminalSettingsShow();
        break;
    }

    terminal.render();
  }

  function menuInit(dt) {
    terminal.baud = 9600;
    terminal.color(7,0);
    terminal.clear();
    terminalSettingsInit(terminal);

    terminal.cells({
      x: MENU_X - 2, y: MENU_Y - 1, ws: [MENU_W], hs: [3], charset: 2,
      header: ' MENU ',
    });

    engine.setState(menu);
    menu(dt);
  }

  engine.setState(menuInit);
}
