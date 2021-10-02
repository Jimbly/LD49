/*eslint global-require:off, no-use-before-define:["error", { "functions": false }], prefer-template:off*/
const local_storage = require('glov/client/local_storage.js');
local_storage.setStoragePrefix('glovjs-playground'); // Before requiring anything else that might load from this

const assert = require('assert');
const engine = require('glov/client/engine.js');
const fs = require('fs');
// const input = require('glov/client/input.js');
const { ceil, floor, max, min, pow, random } = Math;
const net = require('glov/client/net.js');
const { mashString, randCreate } = require('glov/common/rand_alea.js');
const { ansi, padLeft, padRight, terminalCreate } = require('glov/client/terminal.js');
const { terminalSettingsInit, terminalSettingsShow } = require('glov/client/terminal_settings.js');
const ui = require('glov/client/ui.js');
const { clone, plural } = require('glov/common/util.js');


window.Z = window.Z || {};
Z.BACKGROUND = 1;
Z.SPRITES = 10;
Z.PARTICLES = 20;
Z.UI_TEST = 200;

// let app = exports;
// Virtual viewport for our game logic
const game_width = 720;
const game_height = 400;

let ansi_files = {
  welcome: fs.readFileSync(`${__dirname}/ans/welcome.ans`, 'binary'),
  title: fs.readFileSync(`${__dirname}/ans/title.ans`, 'binary'),
};

const NAMES = {
  red:     'Redrast', // eslint-disable-line key-spacing
  yellow:  'Yelldor', // eslint-disable-line key-spacing
  green:   'Greelac', // eslint-disable-line key-spacing
  cyan:    'Cyastil', // eslint-disable-line key-spacing
  blue:    'Bluzal',  // eslint-disable-line key-spacing
  magenta: 'Magenite',
};
const SELL_PRICES = [
  [300, 120], // usually cheaper than COST_HEAL
  [1200, 100], // Gold colored, should usually be most expensive!
  [900, 110], // usually cheaper than COST_L2 / SELL_L2_MULT (1000)
  [800, 250], // usually cheaper than COST_NEW
  [600, 301],
  [100, 1901],
];
const SELL_L2_MULT = 5;
const COLOR_LIST = Object.keys(NAMES);
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

let rand;
let rand_seed = 'test';

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
  const START_GP = 3000;
  const COST_NEW = 1000;
  const COST_NEW_ITEM = { color: 'cyan', count: 1, level: 1 };
  const COST_NEW_MULT = [1, 2, 10, 20, 50, 100];
  const COST_L2 = 5000;
  const COST_L2_ITEM = { color: 'green', count: 1, level: 2 };
  const COST_HEAL = 400;
  const COST_HEAL_ITEM = { color: 'red', count: 1, level: 1 };
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
  function inventoryAdd(item) {
    for (let ii = 0; ii < game_state.inventory.length; ++ii) {
      let test = game_state.inventory[ii];
      if (test.color === item.color && test.level === item.level) {
        test.count += item.count;
        return;
      }
    }
    game_state.inventory.push(item);
  }
  function talk(text) {
    return ansi.yellow(text);
  }
  let home_idx;
  let home_did_age = false;
  let upgrade_did_something = false;
  let inventory_draw_once = false;
  function adjustMarketPrices() {
    game_state.market_prices = [];
    for (let ii = 0; ii < 6; ++ii) {
      game_state.market_prices[ii] = SELL_PRICES[ii][0] + rand.range(SELL_PRICES[ii][1]);
    }
  }
  function healShared() {
    addText(ansi.green.bright(' You pay, then drink the tonic, and are healed.\r\n\r\n'));
    game_state.hp = game_state.maxhp;
    gameState('town');
  }
  const STATES = {
    town: {
      enter: function () {
        upgrade_did_something = false;
        if (home_did_age) {
          home_did_age = false;
          addText(' During the long journey home, the uncrystalized essence\r\n' +
            '   in your vials ages and becomes more volatile.\r\n\n');
        }
        addText(' You stand in the town square, ready for adventure!  Or,\r\n perhaps, a break.\r\n');
        this.menu = {
          '[1] Refiner\'s Guild ': 'upgrade',
          '[2] Market ': 'market',
          '[3] Healer ': 'inn',
          [`[4] Venture Fo${game_state.ventures === 3 ? 'u' : ''}rth `]: 'choice1',
        };
      },
    },
    market: {
      menu: {
        '[1] "Yup!"  Sell crystals. ': 'market_sell',
        '[2] "Nope."  Back to town. ': 'town',
      },
      enter: function () {
        // TODO:
        // Show prices even if we can't sell anything.  There's 12 things here, so,
        //   big grid and then just inventory select (ideally actually in inventory menu)
        addText(' You enter a bustling exchange, full or merchants wanting\r\n' +
          ' to buy crystalized essence.\r\n');
        let header = [];
        let cost1 = [];
        let cost2 = [];
        let column_w = 8;
        for (let ii = 0; ii < COLOR_LIST.length; ++ii) {
          let color = COLOR_LIST[ii];
          header.push(ansi[color].bright(padRight(NAMES[color], column_w)));
          cost1.push(padLeft(game_state.market_prices[ii] + 'Φ ', column_w));
          cost2.push(padLeft(game_state.market_prices[ii] * SELL_L2_MULT + 'Φ ', column_w));
        }
        addText('      ' + header.join('') + '\r\n');
        addText('   L1 ' + ansi.yellow.bright(cost1.join('')) + '\r\n');
        addText('   L2 ' + ansi.yellow.bright(cost2.join('')) + '\r\n');
        addText(' A merchant approaches you, ' + talk('"Have something to sell?\r\n' +
          '   I pay the market rate, just like everyone else."') + '\r\n\r\n');
      },
    },
    market_sell: {
      inventory_menu: function (idx) {
        if (idx === game_state.inventory.length) {
          addText('\n');
          return void gameState('market');
        }
        let item = clone(game_state.inventory[idx]);
        item.count = 1;
        inventoryRemove(item);
        let income = game_state.market_prices[COLOR_LIST.indexOf(item.color)] * pow(SELL_L2_MULT, item.level - 1);
        game_state.gp += income;
        addText(` You sell 1 ${itemBright(item)} for ${ansi.yellow.bright(income + 'Φ')}.\r\n`);
        inventory_draw_once = true;
      },
      enter: function () {
        if (!game_state.inventory.length) {
          addText(' She looks you up and down, saying ' + talk('"You seem to have\r\n' +
            '   nothing I\'m interested in."\r\n') +
          ansi.red(' Come back after distilling the essence of beasts\r\n' +
            '  into crystals.\r\n'));
          return void gameState('town');
        }
      },
    },
    inn: {
      enter: function () {
        addText(' A pale priest presents potent potions for procurement.\r\n');
        if (game_state.hp >= game_state.maxhp) {
          addText(talk('  "You look fine to me, come see me if you\'re injured.\r\n' +
            `   Our regular rates are ${ansi.yellow.bright(COST_HEAL + 'Φ')} ${talk('or a')} ` +
            `${itemDark(COST_HEAL_ITEM)}${talk('.')}\r\n\n`));
          return void gameState('town');
        }
        if (game_state.hp > 50) {
          addText(talk(' "\'Tis but a scratch, you\'ll be fine.  But, I can\'t\r\n' +
            '  say no to business...  How would you like to pay for\r\n  that?"\r\n'));
        } else {
          addText(talk(' "Oof, that looks like it hurts.  How would you like\r\n  to pay for that?"\r\n'));
        }
        this.menu = {
          [`[1] Cash. ${ansi.yellow.bright(COST_HEAL + 'Φ')}. `]: 'heal',
          [`[2] Crystals. A ${itemBright(COST_HEAL_ITEM)}. `]: 'heal_item',
          '[3] On second thought, maybe later... ': 'town',
        };
      },
    },
    heal: {
      enter: function () {
        if (game_state.gp < COST_HEAL) {
          addText(ansi.red(' You cannot afford this.\r\n\n'));
          return void gameState('inn');
        }
        game_state.gp -= COST_HEAL;
        healShared();
      },
    },
    heal_item: {
      enter: function () {
        if (!inventoryHas(COST_HEAL_ITEM)) {
          addText(ansi.red(' You cannot afford this.\r\n\n'));
          return void gameState('inn');
        }
        inventoryRemove(COST_HEAL_ITEM);
        healShared();
      },
    },
    upgrade: {
      enter: function () {
        if (!edaCount() && !upgrade_did_something) {
          addText(' A weathered tinker greets you from behind a desk.\r\n' +
            talk(' "Hello, there!  You seem to be new in town.  If you\'re\r\n' +
              '  going to make your fortune distilling the essence of\r\n' +
              "  magical beasts, you'll need at least a couple vials in\r\n" +
              '  your Essence Distillation Apparatus, or E.D.A. for\r\n' +
              '  short."\r\n\n'));
        }
        addText(talk(' "What can I do for ya?"\r\n'));
        let mult = COST_NEW_MULT[edaCount()];
        COST_NEW_ITEM.count = mult;
        this.menu = {
          [`[1] Install L1 Vial for ${ansi.yellow.bright(COST_NEW * mult + 'Φ')} or ${mult === 1 ? 'a' : mult} ` +
            `${itemBright(COST_NEW_ITEM)} `]:
            'upgradeL1',
          [`[2] Upgrade L1 \x10 L2 Vial for ${ansi.yellow.bright(COST_L2 + 'Φ')} or a` +
            ` ${itemBright(COST_L2_ITEM)} `]:
            'upgradeL2',
          [`[3] ${upgrade_did_something ? 'That\'s all for now' : 'Nothing for now'} `]: 'town',
        };
      },
    },
    upgradeL1: {
      enter: function () {
        if (edaCount() === game_state.eda.length) {
          addText(ansi.red(' Your E.D.A. has no empty expansion slots, try upgrading\r\n instead.\r\n\n'));
          return void gameState('upgrade');
        }
        let cost_item = inventoryHas(COST_NEW_ITEM);
        let mult = COST_NEW_MULT[edaCount()];
        COST_NEW_ITEM.count = mult;
        if (cost_item) {
          addText(` Installing a new L1 Vial for 1 ${itemDark(COST_NEW_ITEM)}...\r\n`);
        } else {
          if (game_state.gp < COST_NEW * mult) {
            addText(ansi.red(' You cannot afford this.\r\n\n'));
            return void gameState('upgrade');
          }
          addText(` Installing a new L1 Vial for ${ansi.yellow.bright(COST_NEW * mult + 'Φ')}...\r\n`);
        }
        addText(' Please select an empty slot:\r\n');
        this.menu = {
          '[0] Cancel transaction ': 'upgrade',
        };
        function doUpgrade(slot) {
          if (cost_item) {
            inventoryRemove(COST_NEW_ITEM);
          } else {
            game_state.gp -= COST_NEW * mult;
          }
          game_state.eda[slot] = {
            max_level: 1,
          };
          addText(ansi.green.bright(' New vial installed!\r\n'));
          if (edaCount() === 1) {
            addText(ansi.black.bright('   HINT: Install one more before venturing forth.\r\n'));
          }
          upgrade_did_something = true;
          gameState('upgrade');
        }
        for (let ii = 0; ii < game_state.eda.length; ++ii) {
          let slot = game_state.eda[ii];
          if (!slot) {
            this.menu[`[${ii+1}] Unoccupied expansion slot `] = doUpgrade.bind(this, ii);
          }
        }
      },
    },
    upgradeL2: {
      enter: function () {
        if (edaCount() === 0) {
          addText(ansi.red(' Your E.D.A. has no installed vials, install one first.\r\n\n'));
          upgrade_did_something = true;
          return void gameState('upgrade');
        }
        let cost_item = inventoryHas(COST_L2_ITEM);
        if (cost_item) {
          addText(` Upgrading L1 \x10 L2 Vial for 1 ${itemDark(COST_L2_ITEM)}...\r\n`);
        } else {
          if (game_state.gp < COST_L2) {
            addText(ansi.red(' You cannot afford this.\r\n\n'));
            return void gameState('upgrade');
          }
          addText(` Upgrading L1 \x10 L2 Vial for ${ansi.yellow.bright(COST_L2 + 'Φ')}...\r\n`);
        }
        addText(' Please select a vial to upgrade:\r\n');
        this.menu = {
          '[0] Cancel transaction ': 'upgrade',
        };
        function doUpgrade(slot) {
          if (cost_item) {
            inventoryRemove(COST_L2_ITEM);
          } else {
            game_state.gp -= COST_L2;
          }
          game_state.eda[slot].max_level = 2;
          addText(ansi.green.bright(` Vial ${slot+1} upgraded!\r\n\n`));
          upgrade_did_something = true;
          gameState('upgrade');
        }
        for (let ii = 0; ii < game_state.eda.length; ++ii) {
          let slot = game_state.eda[ii];
          if (slot && slot.max_level === 1) {
            let label = `[${ii+1}] L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'}`;
            this.menu[label] = doUpgrade.bind(this, ii);
          }
        }
      },
    },
    dead: {
      menu: {
        'Try again ': gameInit,
      },
      enter: function () {
        addText(ansi.red('\r\n You have died.') + '  Thanks for playing!\r\n');
        addText(ansi.green(' Hint: monsters can do up to 50 damage.\r\n   Explosions can do up to 99!\r\n'));
      },
    },
    choice1: {
      enter: function () {
        if (edaCount() < 2) {
          addText(ansi.red(' You must visit the Refiner\'s Guild and install at\r\n' +
            ' least 2 vials into your E.D.A. before continuing.\r\n\n'));
          return void gameState('town');
        }

        addText(' Where do you search for beasts?\r\n');

        function goPath(idx) {
          game_state.location = game_state.paths[idx];
          game_state.enemy = game_state.location.enemy;
          game_state.paths = null;
          game_state.ventures++;
          gameState('fight');
        }

        if (!game_state.paths) {
          game_state.paths = [];
          this.menu = {};
          for (let ii = 0; ii < 3; ++ii) {
            let path = {
              name: 'A lonely path...',
              enemy: {
                name: 'Bugbear',
                damage: floor(rand.random() * rand.random() * 50),
                drops: [],
              },
            };
            let num_drops = engine.DEBUG ? 2 : 1 + floor(rand.random() * rand.random() * 5);
            for (let jj = 0; jj < num_drops; ++jj) {
              let drop = {
                level: 1,
                color: COLOR_LIST[floor(rand.random() * 6)],
                count: floor(5 + rand.random() * 96),
                volatile: 1 + rand.random() * 5,
              };
              drop.orig_count = drop.count;
              path.enemy.drops.push(drop);
            }
            game_state.paths.push(path);
            this.menu[`[${ii+1}] ${path.name} `] = goPath.bind(this, ii);
          }
        }

        this.menu['[4] On second thought... back to town! '] = 'town';
      },
    },
    fight: {
      menu: {
        'Continue ': 'choice2',
      },
      enter: function () {
        addText(` You explore the ${game_state.location.name} and encounter a...\r\n`);
        addText('   ' + ansi.red.bright(game_state.enemy.name) + '!\r\n');
        let damage = game_state.enemy.damage;
        if (damage) {
          addText(` You take ${ansi.red(damage)} damage.\r\n`);
          game_state.hp -= damage;
          if (game_state.hp < 0) {
            return void gameState('dead');
          }
        } else {
          addText(ansi.green.bright(' Lucky!') + '  You escape unscathed.\r\n');
        }
        // let gp = floor(rand.random * 20);
        // addText(`You find ${ansi.yellow.bright(gp)} GP.\r\n`);
        // game_state.gp += gp;
        addText('\r\n');
      },
    },
    choice2: {
      enter: function () {
        home_idx = 0;
        home_did_age = false;
        let drops = game_state.enemy.drops;
        let self = this;
        function showStatus() {
          terminal.subViewPush(body_subview);
          terminal.clear();
          let y = 0;
          terminal.print({
            text: ` The ${ansi.red(game_state.enemy.name)} has been defeated!\r\n`
          });
          y++;
          if (drops.length) {
            terminal.print({ text: '   Essence in need of processing:\r\n' });
            y++;
            for (let ii = 0; ii < drops.length; ++ii) {
              let drop = drops[ii];
              terminal.print({
                x: 5, y,
                fg: 7, bg: 0,
                text: padRight(itemBright(drop), 11),
              });
              if (drop.orig_count !== drop.count) {
                drawBar(17, y, ceil(drop.count / 2), drop.color, ceil(drop.orig_count/4), true);
              } else {
                drawBar(17, y, ceil(drop.count / 2), drop.color, 25, false);
              }
              y++;
            }
          }
          terminal.normal();
          return y;
        }

        function selectVial(slot_idx) {
          let y = showStatus();
          let slot = game_state.eda[slot_idx];
          terminal.print({
            x: 1, y,
            text: `Selected: L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'}\r\n`,
          });
          y++;

          self.menu = {
            '[1] Cancel ': 'choice2',
          };
          let midx = 2;
          if (slot.color) {
            self.menu[`[${midx++}] Drain Vial `] = function () {
              // TODO: animation
              slot.color = null;
              gameState('choice2');
            };
          }
          function fillVial(drop_idx) {
            let drop = drops[drop_idx];
            if (!slot.color) {
              slot.color = drop.color;
              slot.count = drop.count;
              slot.level = min(drop.level, slot.max_level);
              slot.volatile = drop.volatile;
              drops.splice(drop_idx, 1);
            } else {
              slot.level = min(drop.level, slot.level);
              slot.volatile = min(slot.volatile, drop.volatile);
              if (drop.count + slot.count >= 100) {
                // TODO: sound?
                // TODO: display a message when it refreshes the screen?
                inventoryAdd({
                  color: slot.color,
                  level: slot.level,
                  count: 1,
                });
                drop.count -= 100 - slot.count;
                slot.color = null;
                if (!drop.count) {
                  drops.splice(drop_idx, 1);
                }
              } else {
                slot.count += drop.count;
                drops.splice(drop_idx, 1);
              }
            }
            gameState('choice2');
          }
          for (let ii = 0; ii < drops.length; ++ii) {
            let drop = drops[ii];
            if (!slot.color && slot.max_level >= drop.level ||
              slot.color === drop.color && slot.level === drop.level
            ) {
              self.menu[`[${midx++}] Fill with ${itemBright(drop)}`] = fillVial.bind(self, ii);
            } else if (!slot.color || slot.color === drop.color) {
              let min_level = min(slot.level, drop.level, slot.max_level);
              let label = `[${midx++}] Fill with ${itemBright(drop)} (dilute to L${min_level}) `;
              self.menu[label] = fillVial.bind(self, ii);
            }
          }
          terminal.subViewPop();
          refreshMenuPos();
        }
        let y = showStatus();
        this.menu = {};
        if (!drops.length) {
          terminal.print({
            x: 1, y,
            fg: 7, bg: 0,
            text: '\r\n All essence processed.  Volatile vials may explode on\r\n' +
              ' the journey back to town.  Drain additional vials if\r\n' +
              ' desired.\r\n',
          });

          this.menu['[0] Back to town! '] = function () {
            adjustMarketPrices();
            gameState('home');
          };
        } else {
          terminal.print({
            x: 1, y,
            fg: 7, bg: 0,
            text: 'Select a vial to drain or fill:\r\n'
          });
        }
        for (let ii = 0; ii < game_state.eda.length; ++ii) {
          let slot = game_state.eda[ii];
          if (slot) {
            let label = `[${ii+1}] L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'} `;
            this.menu[label] = selectVial.bind(this, ii);
          }
        }
        terminal.subViewPop();
      },
    },
    home: {
      menu: {
        'Continue': '',
      },
      enter: function () {
        let slot = game_state.eda[home_idx];
        ++home_idx;
        let next_state = (home_idx === game_state.eda.length) ? 'town' : 'home';
        this.menu = null;
        if (slot && slot.color) {
          if (rand.random() > slot.volatile) {
            addText(ansi.red.bright('      OH NO!\r\n'));
            // TODO: delay
            addText(` The ${itemBright(slot)} in your L${slot.max_level} Vial explodes!\r\n\n`);
            let damage = 1 + rand.range(99);
            addText(` You lose the contents of the vial and take ${ansi.red(damage)} damage.\r\n`);
            game_state.hp -= damage;
            if (game_state.hp < 0) {
              return void gameState('dead');
            }
            slot.color = null;
            this.menu = {
              'Continue': next_state,
            };
            return;
          } else {
            home_did_age = true;
            slot.volatile = max(0, slot.volatile - rand.floatBetween(0.5, 1));
          }
        }
        gameState(next_state);
      },
    },
  };

  function refreshMenuPos() {
    terminal.subViewPush(body_subview);
    let st = STATES[game_state.state];
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
      refreshMenuPos();
    }
  }
  function gameInit() {
    rand = randCreate(mashString(rand_seed));
    rand_seed = String(random()); // Next one gets pure random
    home_did_age = false;
    game_state = {
      ventures: 0,
      hp: 100,
      maxhp: 100,
      gp: START_GP,
      inventory: [],
      eda: [null, null, null, null, null],
    };
    adjustMarketPrices();
    if (engine.DEBUG && false) {
      //game_state.hp = 90;
      game_state.inventory.push({ count: 2, level: 1, color: 'magenta' },
        { count: 1, level: 1, color: 'blue' },
        { count: 1, level: 2, color: 'blue' });
      game_state.eda[0] = {
        max_level: 1,
      };
      game_state.eda[1] = {
        max_level: 1,
        // max_level: 2,
        // color: 'blue',
        // level: 2,
        // count: 47,
        // volatile: 0,
      };
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
    engine.setState(game);
  }

  function itemDark(item) {
    return ansi[item.color](`L${item.level} ${NAMES[item.color]}`);
  }
  function itemBright(item) {
    return ansi[item.color].bright(`L${item.level} ${NAMES[item.color]}`);
  }
  function drawBar(x, y, count, color, max_w, draw_bg) {
    let w = count / 2;
    let fg = COLORS_BRIGHT[color];
    let bg = draw_bg ? COLORS[color] : 0;
    if (w !== floor(w)) {
      w = floor(w);
      terminal.fill({
        x, y, w, h: 1,
        ch: '█',
        fg, bg,
      });
      terminal.print({
        x: x + w, y,
        text: '▌',
        fg, bg,
      });
      w++;
    } else {
      terminal.fill({
        x, y, w, h: 1,
        ch: '█',
        fg, bg,
      });
    }
    terminal.fill({
      x: x + w, y, w: max_w - w, h: 1,
      ch: ' ',
      fg, bg,
    });
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
      let st = STATES[game_state.state];
      if (!st || !st.inventory_menu || inventory_draw_once) {
        inventory_draw_once = false;
        for (let ii = 0; ii < game_state.inventory.length; ++ii) {
          let item = game_state.inventory[ii];
          terminal.print({
            x: STATUS_X + 1,
            y: y++,
            fg: 7,
            text: padRight(` ${item.count} ${itemBright(item)}`, STATUS_W - 2),
          });
        }
        // Clear two extra lines
        terminal.print({
          x: STATUS_X + 1,
          y: y++,
          fg: 7,
          text: padRight('', STATUS_W - 2),
        });
        terminal.print({
          x: STATUS_X + 1,
          y: y++,
          fg: 7,
          text: padRight('', STATUS_W - 2),
        });
      }
    }

    const VOLATILE_X = 42;
    const VOLATILE_W = 16;
    function drawDistillery() {
      for (let ii = 0; ii < game_state.eda.length; ++ii) {
        let slot = game_state.eda[ii];
        let prefix = ansi.blue.bright(` ${ii === game_state.eda.length - 1 ? '└' : '├'}${ii+1}─ `);
        let y = DISTILL_Y + 1 + 2 * ii;
        terminal.print({
          x: 0, y,
          text: padRight(prefix +
            (!slot ?
              ansi.white('Unoccupied expansion slot') :
              `L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'}`),
          VOLATILE_X),
          fg: 0, bg: 8,
        });
        if (slot && slot.color) {
          if (slot.volatile >= 1) {
            let weeks = floor(slot.volatile);
            terminal.print({
              x: VOLATILE_X, y,
              fg: 7, bg: 8,
              text: padRight(`≥ ${weeks} ${plural(weeks, 'week')}`, VOLATILE_W),
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
          drawBar(BAR_X0, y, slot.count, slot.color, 50, true);
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
    } else if (st && st.inventory_menu) {
      let inventory_menu = [];
      for (let ii = 0; ii < game_state.inventory.length; ++ii) {
        let item = game_state.inventory[ii];
        inventory_menu.push(`${item.count} ${itemBright(item)}`);
      }
      inventory_menu.push('[0] Done');

      let ret = terminal.menu({
        pre_sel: '[',
        pre_unsel: ' ',
        post_sel: ']',
        post_unsel: ' ',
        x: 61,
        y: 5,
        items: inventory_menu,
        color_sel: { fg: 15, bg: 1 },
        color_unsel: { fg: 7, bg: 0 },
        color_execute: { fg: 15, bg: 0 },
      });
      if (ret !== -1) {
        st.inventory_menu(ret);
      }
    }

    terminal.render();
  }

  function intro() {
    let ret = terminal.menu({
      pre_sel: ' ',
      pre_unsel: ' ',
      x: (80 - 'CONTINUE'.length) / 2,
      y: 20,
      items: [
        'CONTINUE ',
      ],
      color_sel: { fg: 15, bg: 1 },
      color_unsel: { fg: 9, bg: 0 },
      color_execute: { fg: 15, bg: 0 },
    });

    terminal.render();

    if (ret !== -1) {
      gameInit();
    }
  }
  function introInit() {
    terminal.normal();
    terminal.clear();
    terminal.print({ x: 0, y: 0, text: ansi_files.welcome.split('\x1a')[0] });
    engine.setState(intro);
  }

  const MENU_W = 20;
  const MENU_X = (80 - MENU_W) / 2;
  const MENU_Y = 20;
  function menu(dt) {
    let sel = terminal.menu({
      x: MENU_X,
      y: MENU_Y,
      items: [
        'New Game ',
        // 'Continue Game ', TODO?
        `${ansi.yellow.bright('[O]')}ptions `,
      ],
    });

    if (engine.DEBUG) {
      gameInit();
    }

    switch (sel) { // eslint-disable-line default-case
      case 0:
        introInit();
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

    terminal.print({ x: 0, y: 0, text: ansi_files.title.split('\x1a')[0] });

    terminal.cells({
      x: MENU_X - 2, y: MENU_Y - 1, ws: [MENU_W], hs: [3], charset: 2,
      header: ' MENU ',
    });

    terminal.print({
      x: 16, y: 25,
      fg: 8, bg: 0,
      text: 'HINT: Press O at any time to open the options',
    });

    engine.setState(menu);
    menu(dt);
  }

  engine.setState(menuInit);
}
