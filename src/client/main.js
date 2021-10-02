/*eslint global-require:off, no-use-before-define:["error", { "functions": false }], prefer-template:off*/
const local_storage = require('glov/client/local_storage.js');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

const assert = require('assert');
const engine = require('glov/client/engine.js');
// const input = require('glov/client/input.js');
const { floor, max, random } = Math;
const net = require('glov/client/net.js');
const { ansi, padRight, terminalCreate } = require('glov/client/terminal.js');
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

const NAMES = {
  red: 'Redrast',
  yellow: 'Yelldor',
  green: 'Greelac',
  cyan: 'Cyastil',
  blue: 'Bluzal',
  magenta: 'Magenite',
};
const COLORS = {
  red: 4,
  yellow: 6,
  green: 2,
  cyan: 3,
  blue: 1,
  magenta: 5,
};
const COLORS_BRIGHT = {
  red: 4+8,
  yellow: 6+8,
  green: 2+8,
  cyan: 3+8,
  blue: 1+8,
  magenta: 5+8,
};

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
    auto_scroll: false,
    z: Z.BACKGROUND + 1,
  });
  // const font = engine.font;

  // Perfect sizes for pixely modes
  ui.scaleSizes(13 / 32);
  ui.setFontHeight(16);

  // Cache KEYS
  // const KEYS = input.KEYS;

  let game_state;
  const BODY_W = 60-2;
  const BODY_H = 13-2;
  const STATUS_W = 20-2;
  const STATUS_H = 25-2;
  const STATUS_X = BODY_W + 2;
  const DISTILL_Y = BODY_H + 2;
  const DISTILL_W = BODY_W + 2;
  const DISTILL_H = 25 - BODY_H - 2;
  const BAR_X0 = 8;
  const START_GP = 2000;
  const COST_NEW = 1000;
  const COST_NEW_ITEM = { color: 'cyan', count: 1, level: 1 };
  const COST_L2 = 5000;
  const COST_L2_ITEM = { color: 'green', count: 1, level: 2 };
  let body_subview;
  function addText(text) {
    terminal.subViewPush(body_subview);
    terminal.print({
      text: text,
    });
    terminal.subViewPop();
  }
  function edaCount() {
    return game_state.eda.filter((a) => a).length;
  }
  function inventoryHas(item) {
    for (let ii = 0; ii < game_state.inventory.length; ++ii) {
      let test = game_state.inventory[ii];
      if (test.color === item.color && test.level === item.level && test.count >= item.count) {
        return true;
      }
    }
    return false;
  }
  function inventoryRemove(item) {
    for (let ii = 0; ii < game_state.inventory.length; ++ii) {
      let test = game_state.inventory[ii];
      if (test.color === item.color && test.level === item.level && test.count >= item.count) {
        test.count -= item.count;
        if (!test.count) {
          game_state.inventory.splice(ii, 1);
        }
        return;
      }
    }
    assert(false);
  }
  function talk(text) {
    return ansi.yellow.bright(text);
  }
  const STATES = {
    town: {
      enter: function () {
        addText('You stand in the town square, ready for adventure!  Or,\r\nperhaps, a break.\r\n');
      },
      menu: {
        '[1] Healer': 'inn',
        '[2] Alchemist\'s Guild ': 'upgrade',
        '[3] Venture Forth ': 'fight',
      },
    },
    inn: {
      enter: function () {
        addText('You rest, and are healed.\r\n\r\n');
        game_state.hp = game_state.maxhp;
        gameState('town');
      },
    },
    fight: {
      enter: function () {
        if (edaCount() < 2) {
          addText(ansi.red('You must visit the Alchemist\'s Guild and install at least ' +
            '2 vials into your E.D.A. before continuing.\r\n\n'));
          return void gameState('town');
        }
        addText('You head into the forest to fight...\r\n');
        // let damage = floor(random() * random() * 50);
        // if (damage) {
        //   addText(`You take ${ansi.red(damage)} damage.\r\n`);
        //   game_state.hp -= damage;
        // } else {
        //   addText('You escape unscathed.\r\n');
        // }
        // let gp = floor(random() * 20);
        // addText(`You find ${ansi.yellow.bright(gp)} GP.\r\n`);
        // game_state.gp += gp;
        // addText('\r\n');
        // gameState('town');
      },
    },
    upgrade: {
      menu: {
        [`[1] Install L1 Vial for ${ansi.yellow.bright(COST_NEW + 'Φ')} or a ` +
          `${itemDark(COST_NEW_ITEM)}`]:
          'upgradeL1',
        [`[2] Upgrade L1 \x10 L2 Vial for ${ansi.yellow.bright(COST_L2 + 'Φ')} or a` +
          ` ${itemDark(COST_L2_ITEM)}`]:
          'upgradeL2',
        '[3] Nothing for now': 'town',
      },
      enter: function () {
        if (!edaCount()) {
          addText('A weathered tinker greets you from behind a desk.  ' +
            talk('"Hello,' +
              "there!  You seem to be new in town.  If you're going to\r\n" +
              'make your fortune distilling the essence of magical\r\n' +
              "beasts, you'll need at least a couple vials in your\r\n" +
              'Essence Distillation Apparatus, or E.D.A. for short."\r\n\n'));
        }
        addText(talk('"What can I do for ya?"\r\n'));
      },
    },
    upgradeL1: {
      enter: function () {
        if (edaCount() === game_state.eda.length) {
          addText(ansi.red('Your E.D.A. has no empty expansion slots, try upgrading instead.\r\n\n'));
          return void gameState('upgrade');
        }
        let cost_item = inventoryHas(COST_NEW_ITEM);
        if (cost_item) {
          addText(`Installing a new L1 Vial for 1 ${itemDark(COST_NEW_ITEM)}...\r\n`);
        } else {
          if (game_state.gp < COST_NEW) {
            addText(ansi.red('You cannot afford this.\r\n\n'));
            return void gameState('upgrade');
          }
          addText(`Installing a new L1 Vial for ${ansi.yellow.bright(COST_NEW + 'Φ')}...\r\n`);
        }
        addText('Please select an empty slot or:\r\n');
        this.menu = {
          '[0] Cancel transaction': 'upgrade',
        };
        function doUpgrade(slot) {
          if (cost_item) {
            inventoryRemove(COST_NEW_ITEM);
          } else {
            game_state.gp -= COST_NEW;
          }
          game_state.eda[slot] = {
            level: 1,
          };
          addText(ansi.green.bright('New vial installed!\r\n'));
          if (edaCount() === 1) {
            addText('HINT: Install one more before venturing forth.\r\n');
          }
          gameState('upgrade');
        }
        for (let ii = 0; ii < game_state.eda.length; ++ii) {
          let slot = game_state.eda[ii];
          if (!slot) {
            this.menu[`[${ii+1}] Unoccupied expansion slot`] = doUpgrade.bind(this, ii);
          }
        }
      },
    },
    upgradeL2: {
      enter: function () {
        if (edaCount() === 0) {
          addText(ansi.red('Your E.D.A. has installed vials, install one first.\r\n\n'));
          return void gameState('upgrade');
        }
        let cost_item = inventoryHas(COST_L2_ITEM);
        if (cost_item) {
          addText(`Upgrading L1 \x10 L2 Vial for 1 ${itemDark(COST_L2_ITEM)}...\r\n`);
        } else {
          if (game_state.gp < COST_L2) {
            addText(ansi.red('You cannot afford this.\r\n\n'));
            return void gameState('upgrade');
          }
          addText(`Upgrading L1 \x10 L2 Vial for ${ansi.yellow.bright(COST_L2 + 'Φ')}...\r\n`);
        }
        addText('Please select a vial to upgrade or:\r\n');
        this.menu = {
          '[0] Cancel transaction': 'upgrade',
        };
        function doUpgrade(slot) {
          if (cost_item) {
            inventoryRemove(COST_L2_ITEM);
          } else {
            game_state.gp -= COST_L2;
          }
          game_state.eda[slot].level = 2;
          addText(ansi.green.bright('Vial upgraded!\r\n'));
          gameState('upgrade');
        }
        for (let ii = 0; ii < game_state.eda.length; ++ii) {
          let slot = game_state.eda[ii];
          if (slot && slot.level === 1) {
            this.menu[`[${ii+1}] L1 Vial`] = doUpgrade.bind(this, ii);
          }
        }
      },
    },
  };
  function gameState(state) {
    let st = STATES[state];
    game_state.state = state;

    terminal.normal();
    st.enter();
    if (game_state.state !== state) {
      // already left
      return;
    }
    if (st.menu) {
      terminal.subViewPush(body_subview);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      let key_count = Object.keys(st.menu).length;
      for (let ii = 0; ii < key_count - 1; ++ii) {
        terminal.print({ text: '\n' });
      }
      // terminal.print({ text: '> ' });

      terminal.subViewPop();
      game_state.menu_cursor_x = body_subview.cursor_x;
      game_state.menu_cursor_y = body_subview.cursor_y;
      game_state.menu_x = body_subview.x;
      game_state.menu_y = body_subview.cursor_y - key_count + 1;
    }
  }
  function gameInit() {
    game_state = {
      hp: 100,
      maxhp: 100,
      gp: START_GP,
      inventory: [],
      eda: [null, null, null, null, null],
    };
    if (engine.DEBUG) {
      game_state.gp = 20000;
      // game_state.inventory.push({ count: 1, level: 1, color: 'red' });
      // game_state.eda[1] = {
      //   level: 1,
      // };
      // game_state.eda[2] = {
      //   level: 2,
      //   color: 'blue',
      //   count: 47,
      //   volatile: 0.75,
      // };
    }
    terminal.autoScroll(false);
    body_subview = {
      x: 1, y: 1, w: BODY_W, h: BODY_H,
      cursor_x: 1, cursor_y: 1,
    };
    terminal.color(7,0);
    terminal.clear();

    terminal.color(1,0);
    terminal.cells({
      x: 0, y: 0, ws: [BODY_W], hs: [BODY_H], charset: 2,
      header: ' ADVENTURE ',
    });
    terminal.color(6,0);
    terminal.cells({
      x: STATUS_X, y: 0, ws: [STATUS_W], hs: [STATUS_H], charset: 3,
      header: ' HERO ',
    });
    terminal.color(7,8);
    terminal.fill({
      x: 0, y: DISTILL_Y,
      w: DISTILL_W-1, h: DISTILL_H-1,
    });
    terminal.color(8,0);
    terminal.fill({
      x: DISTILL_W-1, y: DISTILL_Y + 1,
      w: 1, h: DISTILL_H-2,
      ch: '░',
    });
    terminal.fill({
      x: 1, y: 24,
      w: DISTILL_W - 1, h: 1,
      ch: '░',
    });
    terminal.print({
      x: 3, y: DISTILL_Y,
      text: 'ESSENCE DISTILLATION APPARATUS',
      fg: 15, bg: 8,
    });
    terminal.print({
      x: 1, y: DISTILL_Y,
      text: '┌',
      fg: 9, bg: 8,
    });
    for (let ii = 0; ii < 4; ++ii) {
      terminal.print({
        x: 1, y: DISTILL_Y + 2 + 2 * ii,
        text: '│',
        fg: 9, bg: 8,
      });
    }

    terminal.autoScroll(true);
    terminal.color(7,0);
    gameState('town');
  }

  function itemDark(item) {
    return ansi[item.color](`L${item.level} ${NAMES[item.color]}`);
  }
  function itemBright(item) {
    return ansi[item.color].bright(`L${item.level} ${NAMES[item.color]}`);
  }

  function game(dt) {

    function drawStatus() {
      let health_percent = game_state.hp / game_state.maxhp;
      let health_color = health_percent < 0.5 ? 'red' : 'green';
      let y = 1;
      terminal.normal();
      terminal.print({
        x: STATUS_X + 2,
        y: y++,
        fg: 6,
        text: padRight(`HP: ${ansi[health_color].bright(`${game_state.hp} / ${game_state.maxhp}`)}  `, STATUS_W - 2),
      });
      terminal.print({
        x: STATUS_X + 2,
        y: y++,
        fg: 6,
        text: padRight(`COIN: ${ansi.yellow.bright(`${game_state.gp}Φ`)}  `, STATUS_W - 2),
      });
      y++;

      terminal.print({
        x: STATUS_X + 2,
        y: y++,
        fg: 6,
        text: 'Inventory:',
      });
      for (let ii = 0; ii < game_state.inventory.length; ++ii) {
        let item = game_state.inventory[ii];
        terminal.print({
          x: STATUS_X + 2,
          y: y++,
          fg: 7,
          text: `${item.count} ${itemDark(item)}`,
        });
      }
    }

    function drawBar(x, y, count, color) {
      let w = count / 2;
      if (w !== floor(w)) {
        w = floor(w);
        terminal.fill({
          x, y, w, h: 1,
          ch: '█',
          fg: COLORS_BRIGHT[color], bg: COLORS[color],
        });
        terminal.print({
          x: x + w, y,
          text: '▌',
          fg: COLORS_BRIGHT[color], bg: COLORS[color],
        });
        w++;
      } else {
        terminal.fill({
          x, y, w, h: 1,
          ch: '█',
          fg: COLORS_BRIGHT[color], bg: COLORS[color],
        });
      }
      terminal.fill({
        x: x + w, y, w: 50 - w, h: 1,
        ch: ' ',
        fg: COLORS_BRIGHT[color], bg: COLORS[color],
      });
    }

    const VOLATILE_X = 43;
    const VOLATILE_W = 16;
    function drawDistillery() {
      for (let ii = 0; ii < game_state.eda.length; ++ii) {
        let slot = game_state.eda[ii];
        let prefix = ansi.blue.bright(` ${ii === game_state.eda.length - 1 ? '└' : '├'}─ `);
        let y = DISTILL_Y + 1 + 2 * ii;
        terminal.print({
          x: 0, y,
          text: padRight(prefix +
            (!slot ?
              ansi.black('Unoccupied expansion slot') :
              `L${slot.level} Vial: ${slot.color ? itemBright(slot) : 'Empty'}`),
          VOLATILE_X),
          fg: 7, bg: 8,
        });
        if (slot && slot.color) {
          if (slot.volatile >= 1) {
            terminal.print({
              x: VOLATILE_X, y,
              fg: 7, bg: 8,
              text: padRight(`≥ ${floor(slot.volatile)} weeks`, VOLATILE_W),
            });
          } else {
            let percent = max(1, floor((1 - slot.volatile) * 100));
            let str = padRight(`VOLATILE! (${percent}%)`, VOLATILE_W);
            if (percent > 50) {
              str = ansi.blink(str);
            }
            terminal.print({
              x: VOLATILE_X, y,
              fg: 14, bg: 8,
              text: str,
            });
          }
        } else {
          terminal.fill({
            x: VOLATILE_X, y, w: VOLATILE_W, h: 1,
            ch: ' ',
            fg: 7, bg: 8,
          });
        }
        y++;
        if (slot && slot.color) {
          drawBar(BAR_X0, y, slot.count, slot.color);
        } else {
          // clear bar
          terminal.fill({
            x: BAR_X0, y, w: 50, h: 1,
            ch: ' ',
            fg: 7, bg: 8,
          });
        }
      }

    }

    drawStatus();
    drawDistillery();

    let st = STATES[game_state.state];
    if (st && st.menu) {
      st.menu_keys = Object.keys(st.menu);
      let ret = terminal.menu({
        pre_sel: ' ■ ',
        pre_unsel: '   ',
        x: game_state.menu_x,
        y: game_state.menu_y,
        items: st.menu_keys,
        color_sel: { fg: 15, bg: 1 },
        color_unsel: { fg: 9, bg: 0 },
        color_execute: { fg: 15, bg: 0 },
      });
      //terminal.moveto(game_state.menu_cursor_x, game_state.menu_cursor_y);
      terminal.normal();
      if (ret !== -1) {
        //addText(`${st.menu_keys[ret]}\r\n`);
        addText('\r\n\r\n');
        ret = st.menu[st.menu_keys[ret]];
        if (typeof ret === 'string') {
          gameState(ret);
        } else if (typeof ret === 'function') {
          ret();
        } else {
          assert(false);
        }
      }
    }

    terminal.render();
  }

  const MENU_W = 20;
  const MENU_X = (80 - MENU_W) / 2;
  const MENU_Y = 5;
  function menu(dt) {
    let sel = terminal.menu({
      x: MENU_X,
      y: 5,
      items: [
        'New Game ',
        // 'Continue Game ', TODO?
        `${ansi.yellow.bright('[O]')}ptions `,
      ],
    });

    if (engine.DEBUG) {
      sel = 0;
    }

    switch (sel) { // eslint-disable-line default-case
      case 0:
        gameInit();
        engine.setState(game);
        break;
      case 1:
        terminalSettingsShow();
        break;
    }

    terminal.render();
  }

  function menuInit(dt) {
    terminal.baud = engine.DEBUG ? 56600 : 9600;
    terminal.color(7,0);
    terminal.clear();
    terminalSettingsInit(terminal);

    terminal.cells({
      x: MENU_X - 2, y: MENU_Y - 1, ws: [MENU_W], hs: [3], charset: 2,
      header: ' MENU ',
    });

    terminal.print({
      x: 16, y: 20,
      fg: 8, bg: 0,
      text: 'HINT: Press O at any time to open the options',
    });

    engine.setState(menu);
    menu(dt);
  }

  engine.setState(menuInit);
}
