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
const score_system = require('glov/client/score.js');
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
const COLOR_DESC = {
  red: 'Not very valuable, but the healers take \'em',
  yellow: 'Consistently valuable',
  green: 'Good price, refiners use \'em for upgrades',
  cyan: 'Good price, refiners use \'em for upgrades',
  blue: 'Less volatile and less valuable',
  magenta: 'Very volatile price, but the crystals\r\n      are no more unstable than the rest',
};
const SELL_PRICES = [
  [300, 120], // usually cheaper than COST_HEAL
  [1200, 100], // Gold colored, should usually be most expensive!
  [900, 110], // usually cheaper than COST_L2 / SELL_L2_MULT (1000)
  [800, 250], // usually cheaper than COST_NEW
  [600, 301],
  [100, 1901], // sometimes cheaper than COST_UNLOCK_L2
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
let rand_seed = 'test1';

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
  const COST_NEW = 1000;
  const COST_NEW_ITEM = { color: 'cyan', count: 1, level: 1 };
  const COST_NEW_MULT = [1, 2, 4, 10, 20, 50];
  const COST_WIN = 50000;
  const COST_L2 = 5000;
  const COST_L2_ITEM = { color: 'green', count: 1, level: 2 };
  const COST_HEAL = 400;
  const COST_HEAL_ITEM = { color: 'red', count: 1, level: 1 };
  const COST_DIVINER = 500;
  const COST_DIVINE_DANGER = 100;
  const COST_DIVINE_ESSENCE = 100;
  const COST_UNLOCK_L2 = 1500;
  const COST_UNLOCK_L2_ITEM = { color: 'magenta', count: 1, level: 1 };
  const START_GP = COST_NEW + COST_NEW * COST_NEW_MULT[1]; // ? + COST_HEAL;
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
  function cost(number) {
    number = String(number);
    if (number.length > 3) {
      number = number.slice(0, -3) + ',' + number.slice(-3);
    }
    return ansi.yellow.bright(number + 'Φ');
  }
  let home_idx;
  let home_did_age = false;
  let upgrade_did_something = false;
  let inventory_draw_once = false;
  let eda_draw_once = false;
  let select_vial = null;
  let distill_last_message = null;
  function updateHighScores() {
    score_system.setScore(0,
      { gp: game_state.earned_gp, ventures: game_state.ventures }
    );

  }
  function adjustMarketPrices() {
    game_state.market_prices = [];
    for (let ii = 0; ii < 6; ++ii) {
      game_state.market_prices[ii] = SELL_PRICES[ii][0] + rand.range(SELL_PRICES[ii][1]);
    }
  }
  function healShared() {
    addText(ansi.green.bright(' You pay, then drink the tonic, and are healed.\r\n\r\n'));
    game_state.hp = game_state.maxhp;
  }
  const MENU_CONTINUE = {
    '[0] Continue ': 'town',
  };
  function randMessage(list) {
    return list[floor(random() * list.length)];
  }
  function randomizeArray(arr) {
    for (let ii = 0; ii < arr.length; ++ii) {
      let idx = floor(random() * (arr.length - ii));
      let t = arr[ii];
      arr[ii] = arr[idx];
      arr[idx] = t;
    }
  }
  const STATES = {
    town: {
      enter: function () {
        upgrade_did_something = false;
        if (home_did_age) {
          home_did_age = false;
          addText(' During the long journey home, the uncrystalized essence\r\n' +
            '   in your vials ages and becomes more volatile.\r\n');
        }
        addText(' You stand in the town square, ready for adventure!  Or,\r\n' +
          randMessage([
            ' perhaps, a break',
            ' perhaps not',
            ' maybe some shopping',
            ' whatever passes for adventure here',
          ]) +
          '.\r\n');
        if (edaCount() < 2) {
          addText(ansi.green('    HINT: Install 2 vials at the Refiner\'s Guild\r\n'));
        } else if (!game_state.gp && !game_state.inventory.length) {
          addText(ansi.green('    HINT: Venture Forth until you crystalize a gem\r\n'));
        } else if (!game_state.gp && (!game_state.diviner || game_state.hp < 50) && game_state.inventory.length) {
          addText(ansi.green('    HINT: Consider selling your gem at the market\r\n'));
        } else if (!game_state.diviner && game_state.gp >= COST_DIVINER + COST_DIVINE_ESSENCE) {
          addText(ansi.green('    HINT: Contract with a Diviner at their Guild\r\n'));
        } else if (game_state.hp < 50 && game_state.gp) {
          addText(ansi.green('    HINT: Visit the healer to heal.  Death ends all.\r\n'));
        }
        this.menu = {
          '[1] Refiner\'s Guild ': 'upgrade',
          '[2] Market ': 'market',
          '[3] Healer ': 'inn',
          '[4] Diviner\'s Guild ': 'diviner',
          [`[5] Venture Fo${game_state.ventures === 3 ? 'u' : ''}rth `]: 'choice1',
          [`[6] Buy ticket home for ${cost(COST_WIN)}` +
            `${game_state.gp >= COST_WIN ? ansi.green.bright(' (win game)') : ''}`]: 'win',
        };
      },
    },
    diviner: {
      enter: function () {
        addText(' You descend into the dusty domain of the diviners.\r\n');
        this.menu = {};
        let midx = 1;
        this.menu['[0] Maybe later. '] = 'town';
        if (!game_state.diviner && edaCount() < 2) {
          addText(' An stuffy young man looks you over.\r\n' +
            talk(' "Sorry, we only service serious Refiners here, maybe\r\n' +
              '  you should acquire some better equipment first.\r\n'));
          addText(ansi.black.bright('    HINT: Install 2 vials at the Refiner\'s Guild.\r\n'));
          this.menu = MENU_CONTINUE;
          return;
        }
        if (!game_state.diviner) {
          addText(' An eager young man approaches you.\r\n' +
            talk(' "Oh, a new client!  Would you hire me?  Please?\r\n' +
              '  With my skills I can give hint as to which paths\r\n' +
              '  are more dangerous, and which may contain various\r\n' +
              '  kinds of essence.  For a price, of course."\r\n'));
          this.menu[`[${midx++}] Acquire diviner contract for ${cost(COST_DIVINER)} `] = 'diviner_hire';
        }
        this.menu[`[${midx++}] ${game_state.divined.danger ? ansi.green.bright('√ ') : ''}` +
          `Divine danger for ${cost(COST_DIVINE_DANGER)} (1 venture) `] = 'divine_danger';
        this.menu[`[${midx++}] ${game_state.divined.essence ? ansi.green.bright('√ ') : ''}` +
          `Estimate essence for ${cost(COST_DIVINE_ESSENCE)} (1 venture) `] = 'divine_essence';
      },
    },
    diviner_hire: {
      enter: function () {
        if (game_state.gp < COST_DIVINER) {
          addText(ansi.red(' You cannot afford this.\r\n\n'));
          return void gameState('town');
        }
        game_state.gp -= COST_DIVINER;
        game_state.diviner = 1;
        addText(ansi.green.bright(' Diviner hired!  Make sure to use his services\r\n' +
          '   before venturing forth.\r\n'));
        gameState('diviner');
      },
    },
    divine_danger: {
      enter: function () {
        if (game_state.gp < COST_DIVINE_DANGER) {
          addText(ansi.red(' You cannot afford this.\r\n\n'));
          return void gameState('diviner');
        }
        if (game_state.divined.danger) {
          addText(ansi.green(' You have already paid for this service.\r\n\n'));
          return void gameState('diviner');
        }
        game_state.gp -= COST_DIVINE_DANGER;
        game_state.divined.danger = true;
        addText(ansi.green.bright(' Your diviner details dangerous denizens.\r\n'));
        addText(ansi.black.bright('   (Danger will be indicated when you Venture Forth)\r\n\n'));
        gameState('diviner');
      }
    },
    divine_essence: {
      enter: function () {
        if (game_state.gp < COST_DIVINE_ESSENCE) {
          addText(ansi.red(' You cannot afford this.\r\n\n'));
          return void gameState('diviner');
        }
        if (game_state.divined.essence) {
          addText(ansi.green(' You have already paid for this service.\r\n\n'));
          return void gameState('diviner');
        }
        game_state.gp -= COST_DIVINE_ESSENCE;
        game_state.divined.essence = true;
        addText(ansi.green.bright(' He predicts possible extractable essence.\r\n'));
        addText(ansi.black.bright('   (Predictions will be indicated when you Venture Forth)\r\n\n'));
        gameState('diviner');
      }
    },
    unlock_l2: {
      enter: function () {
        upgrade_did_something = true;
        if (edaCount() < 2) {
          addText(ansi.red(' You must install at least 2 vials before upgrading.\r\n\n'));
          return void gameState('upgrade');
        }
        if (game_state.unlock_l2) {
          addText(ansi.red(' You already have this upgrade.\r\n'));
          return void gameState('upgrade');
        }
        let cost_item = inventoryHas(COST_UNLOCK_L2_ITEM);
        if (cost_item) {
          inventoryRemove(COST_UNLOCK_L2_ITEM);
          addText(` Paid 1 ${itemDark(COST_UNLOCK_L2_ITEM)}.\r\n`);
        } else {
          if (game_state.gp < COST_UNLOCK_L2) {
            addText(ansi.red(' You cannot afford this.\r\n\n'));
            return void gameState('upgrade');
          }
          game_state.gp -= COST_UNLOCK_L2;
          addText(` Paid ${cost(COST_UNLOCK_L2)}.\r\n`);
        }
        game_state.unlock_l2 = true;
        addText(ansi.green.bright(' You will now find beasts that yield L2 essences!\r\n\n'));
        gameState('upgrade');
      },
    },
    market: {
      menu: {
        '[0] "Nope."  Back to town. ': 'town',
        '[1] "Yup!"  Sell crystals. ': 'market_sell',
        '[2] "What\'s special about these crystals?" ': 'about_crystals',
      },
      enter: function () {
        addText(' You enter a bustling bazaar, full of merchants wanting\r\n' +
          ' to buy crystalized essence.\r\n');
        let header = [];
        let cost1 = [];
        let cost2 = [];
        let column_w = 8;
        for (let ii = 0; ii < COLOR_LIST.length; ++ii) {
          let color = COLOR_LIST[ii];
          header.push(ansi[color].bright(padRight(NAMES[color], column_w)));
          cost1.push(padLeft(cost(game_state.market_prices[ii]), column_w - 1));
          cost2.push(padLeft(cost(game_state.market_prices[ii] * SELL_L2_MULT), column_w - 1));
        }
        addText('      ' + header.join('') + '\r\n');
        addText('   L1 ' + cost1.join(' ') + '\r\n');
        addText('   L2 ' + cost2.join(' ') + '\r\n');
        addText(' A merchant approaches you, ' + talk('"Have something to sell?\r\n' +
          '   I pay the week\'s market rate, just like anyone else."') + '\r\n\r\n');
      },
    },
    about_crystals: {
      menu: MENU_CONTINUE,
      enter: function () {
        for (let ii = 0; ii < COLOR_LIST.length; ++ii) {
          let color = COLOR_LIST[ii];
          let name = NAMES[color];
          addText(`  ${ansi[color].bright(name)}: ${COLOR_DESC[color]}\r\n`);
        }
        addText('\r\n');
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
        game_state.earned_gp += income;
        updateHighScores();
        addText(` You sell 1 ${itemBright(item)} for ${cost(income)}.\r\n`);
        inventory_draw_once = true;
      },
      menu_key: 'sell',
      enter: function () {
        if (!game_state.inventory.length) {
          addText(' She looks you up and down, saying ' + talk('"You seem to have\r\n' +
            '   nothing I\'m interested in."\r\n') +
          ansi.red(' Come back after distilling the essence of beasts\r\n' +
            '  into crystals.\r\n'));
          this.menu = MENU_CONTINUE;
          return;
        }
        this.menu = null;
      },
    },
    win: {
      enter: function () {
        if (game_state.gp < COST_WIN) {
          addText(ansi.red(' You cannot afford this.\r\n\n'));
          return void gameState('town');
        }
        game_state.gp -= COST_WIN;
        addText(' You pay the fee, board the airship, and return home.\r\n' +
          '   The journey is as uneventful and uninteresting as\r\n   this victory screen.\r\n');
        addText(` You retire "in style" with your remaining ${cost(game_state.gp)}.\r\n\n`);

        addText(ansi.green.bright('                      YOU WIN!\r\n\n'));
        addText(ansi.blue.bright('                 Thanks for playing!\r\n\n'));
      },
    },
    inn: {
      enter: function () {
        addText(' A pale priest presents potent potions for procurement.\r\n');
        if (game_state.hp >= game_state.maxhp) {
          addText(talk('  "You look fine to me, come see me if you\'re injured.\r\n' +
            `   Our regular rates are ${cost(COST_HEAL)} ${talk('or a')} ` +
            `${itemDark(COST_HEAL_ITEM)}${talk('.')}\r\n\n`));
          this.menu = MENU_CONTINUE;
          return;
        }
        if (game_state.hp > 50) {
          addText(talk(' "\'Tis but a scratch, you\'ll be fine.  But, I can\'t\r\n' +
            '  say no to business...  How would you like to pay for\r\n  that?"\r\n'));
        } else {
          addText(talk(' "Oof, that looks like it hurts.  How would you like\r\n  to pay for that?"\r\n'));
        }
        this.menu = {
          '[0] Yeah, fine... ': 'town',
          [`[1] Cash. ${cost(COST_HEAL)}. `]: 'heal',
          [`[2] Crystals. A ${itemBright(COST_HEAL_ITEM)}. `]: 'heal_item',
        };
      },
    },
    heal: {
      menu: MENU_CONTINUE,
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
      menu: MENU_CONTINUE,
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
              '  short."\r\n'));
        }
        addText(talk(' "What can I do for ya?"\r\n'));
        let mult = COST_NEW_MULT[edaCount()];
        COST_NEW_ITEM.count = mult;
        this.menu = {
          [`[0] ${upgrade_did_something ? 'That\'s all for now' : 'Nothing for now'} `]: 'town',
          [`[1] Install L1 Vial for ${cost(COST_NEW * mult)} or ${mult === 1 ? 'a' : mult} ` +
            `${itemBright(COST_NEW_ITEM)} `]:
            'upgradeL1',
          [`[2] Unlock L2 distillation for ${cost(COST_UNLOCK_L2)} or` +
            ` ${itemBright(COST_UNLOCK_L2_ITEM)} `]: 'unlock_l2',
          [`[3] Upgrade L1 \x10 L2 Vial for ${cost(COST_L2)} or a` +
            ` ${itemBright(COST_L2_ITEM)} `]:
            'upgradeL2',
        };
      },
    },
    upgradeL1: {
      enter: function () {
        if (edaCount() === game_state.eda.length) {
          addText(ansi.red(' Your E.D.A. has no empty expansion slots, try upgrading\r\n instead.\r\n\n'));
          return void gameState('upgrade');
        }
        let mult = COST_NEW_MULT[edaCount()];
        COST_NEW_ITEM.count = mult;
        let cost_item = inventoryHas(COST_NEW_ITEM);
        if (cost_item) {
          addText(` Installing a new L1 Vial for ${COST_NEW_ITEM.count} ${itemDark(COST_NEW_ITEM)}...\r\n`);
        } else {
          if (game_state.gp < COST_NEW * mult) {
            addText(ansi.red(' You cannot afford this.\r\n\n'));
            return void gameState('upgrade');
          }
          addText(` Installing a new L1 Vial for ${cost(COST_NEW * mult)}...\r\n`);
        }
        addText(' Please select an empty slot below.\r\n');
        refreshMenuPos();
        this.vial_menu = {};
        this.vial_menu.cancel = {
          label: '[0] Cancel transaction ',
          func: function () {
            addText('\r\n\n');
            gameState('upgrade');
          },
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
          addText('\r\n\n');
          addText(ansi.green.bright(' New vial installed!\r\n\n'));
          if (edaCount() === 1) {
            addText(ansi.black.bright('   HINT: Install one more before venturing forth.\r\n'));
          }
          upgrade_did_something = true;
          gameState('upgrade');
        }
        this.vial_menu.func = doUpgrade;
        this.vial_menu.filter = (slot) => !slot;

        // for (let ii = 0; ii < game_state.eda.length; ++ii) {
        //   let slot = game_state.eda[ii];
        //   if (!slot) {
        //     this.menu[`[${ii+1}] Unoccupied expansion slot `] = doUpgrade.bind(this, ii);
        //   }
        // }
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
          addText(` Upgrading L1 \x10 L2 Vial for ${cost(COST_L2)}...\r\n`);
        }
        addText(' Please select a vial to upgrade:\r\n');
        this.menu = null;
        refreshMenuPos();
        this.vial_menu = {};
        this.vial_menu.cancel = {
          label: '[0] Cancel transaction ',
          func: function () {
            addText('\r\n\n');
            gameState('upgrade');
          },
        };
        function doUpgrade(slot) {
          if (cost_item) {
            inventoryRemove(COST_L2_ITEM);
          } else {
            game_state.gp -= COST_L2;
          }
          game_state.eda[slot].max_level = 2;
          addText('\r\n\n');
          addText(ansi.green.bright(` Vial ${slot+1} upgraded!\r\n\n`));
          upgrade_did_something = true;
          gameState('upgrade');
        }
        this.vial_menu.func = doUpgrade;
        this.vial_menu.filter = (slot) => slot && slot.max_level === 1;
        // for (let ii = 0; ii < game_state.eda.length; ++ii) {
        //   let slot = game_state.eda[ii];
        //   if (slot && slot.max_level === 1) {
        //     let label = `[${ii+1}] L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'}`;
        //     this.menu[label] = doUpgrade.bind(this, ii);
        //   }
        // }
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
          this.menu = MENU_CONTINUE;
          return;
        }

        addText(` Where do you search for ${game_state.ventures > 6 ? 'bears' : 'beasts'}?\r\n`);

        function goPath(idx) {
          game_state.location = game_state.paths[idx];
          game_state.enemy = game_state.location.enemy;
          game_state.paths = null;
          game_state.ventures++;
          updateHighScores();
          gameState('fight');
        }

        if (!game_state.paths) {
          let PATHS = [
            { name: 'Green grove' },
            { name: 'Rocky ridge' },
            { name: 'Coastal cavern' },
            { name: 'Dark dungeon' },
            { name: 'Mountain mine' },
            { name: 'Frozen forest' },
            { name: 'Wet wasteland' },
          ];
          let ENEMIES = [
            { name: 'Bear', venture: 0 },
            { name: 'Werebear', venture: 1 },
            { name: 'Bugbear', venture: 1 },
            { name: 'Owlbear', venture: 1 },
            { name: 'Bearicorn', venture: 3 },
            { name: 'Dracobear', venture: 5 },
            { name: 'Miniature Giant Spacebear', venture: 5 },
            { name: 'B.O.U.S.', venture: 5 },
            { name: 'Barebear', venture: 10 },
            { name: 'Bearbear', venture: 10 },
            { name: 'Beerbear', venture: 10 },
            { name: 'Carebear', venture: 10 },
          ];
          ENEMIES = ENEMIES.filter((a) => game_state.ventures >= a.venture);

          game_state.paths = [];
          for (let ii = 0; ii < 3; ++ii) {
            let baseidx = rand.range(PATHS.length);
            let path_base = PATHS[baseidx];
            PATHS.splice(baseidx, 1);
            baseidx = rand.range(ENEMIES.length);
            let enemy_base = ENEMIES[baseidx];
            let path = {
              name: path_base.name,
              enemy: {
                name: enemy_base.name,
                damage: floor(rand.random() * rand.random() * 50),
                drops: [],
              },
            };
            path.divine_danger = path.enemy.damage + (rand.random() - 0.5) * 20;
            let num_drops = 1 + floor(rand.random() * rand.random() * 5);
            let count_scale = num_drops === 1 ? 1.5 : num_drops === 2 ? 1.25 : 1;
            path.divine_essence = [];
            for (let jj = 0; jj < num_drops; ++jj) {
              let drop = {
                level: 1,
                color: COLOR_LIST[rand.range(6)],
                count: ceil((5 + rand.range(96)) * count_scale),
                volatile: 1 + rand.random() * 5,
              };
              if (drop.color === 'blue') {
                drop.volatile += 1 + rand.random() * 5;
              }
              if (game_state.unlock_l2 && rand.random() < 0.4) {
                drop.level = 2;
              }
              drop.orig_count = drop.count;
              path.enemy.drops.push(drop);
              if (path.divine_essence.length < 2) {
                path.divine_essence.push(drop.color);
              }
            }
            while (path.divine_essence.length < 3) {
              path.divine_essence.push(COLOR_LIST[rand.range(6)]);
            }
            randomizeArray(path.divine_essence);

            game_state.paths.push(path);
          }
        }

        this.menu = {};
        this.menu['[0] On second thought... back to town! '] = 'town';
        let place_len = 0;
        for (let ii = 0; ii < game_state.paths.length; ++ii) {
          let path = game_state.paths[ii];
          place_len = max(path.name.length, place_len);
        }
        for (let ii = 0; ii < game_state.paths.length; ++ii) {
          let path = game_state.paths[ii];
          let label = `[${ii+1}] ${padRight(path.name, place_len)}`;
          if (game_state.divined.danger) {
            if (path.divine_danger < 10) {
              label += ansi.green.bright('   (easy)   ');
            } else if (path.divine_danger < 20) {
              label += ansi.yellow.bright(' (some risk)');
            } else {
              label += ansi.red.bright(' (dangerous)');
            }
          }
          if (game_state.divined.essence) {
            label += ' ';
            for (let jj = 0; jj < path.divine_essence.length; ++jj) {
              let color = path.divine_essence[jj];
              label += ansi[color].bright('■');
            }
          }
          this.menu[`${label} `] = goPath.bind(this, ii);
        }

        let midx = 4;
        if (game_state.diviner && !game_state.divined.danger && game_state.gp >= COST_DIVINE_DANGER) {
          this.menu[`[${midx++}] Divine danger for ${cost(COST_DIVINE_DANGER)} `] = () => {
            game_state.divined.danger = true;
            game_state.gp -= COST_DIVINE_DANGER;
            gameState('choice1');
          };
        }
        if (game_state.diviner && !game_state.divined.essence && game_state.gp >= COST_DIVINE_ESSENCE) {
          this.menu[`[${midx++}] Estimate essence for ${cost(COST_DIVINE_ESSENCE)} `] = () => {
            game_state.divined.essence = true;
            game_state.gp -= COST_DIVINE_ESSENCE;
            gameState('choice1');
          };
        }

      },
    },
    fight: {
      menu: {
        '[0] Continue ': 'choice2',
      },
      enter: function () {
        distill_last_message = null;
        addText(` You explore the ${game_state.location.name} and encounter a...\r\n`);
        addText('   ' + ansi.red.bright(game_state.enemy.name) + '!\r\n');
        let damage = game_state.enemy.damage;
        if (damage) {
          addText(` You take ${ansi.red(damage)} damage in subduing the bear.\r\n`);
          game_state.hp -= damage;
          if (game_state.hp < 0) {
            return void gameState('dead');
          }
        } else {
          addText(ansi.green.bright(' Lucky!') + '  You escape unscathed.\r\n');
        }
        addText('\r\n');
      },
    },
    choice2: {
      enter: function () {
        select_vial = null;
        eda_draw_once = true;
        home_idx = 0;
        home_did_age = false;
        game_state.divined = {};
        let drops = game_state.enemy.drops;
        let self = this;
        function showStatus() {
          terminal.subViewPush(body_subview);
          terminal.normal();
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
                drawBar(17, y, min(50, ceil(drop.count / 2)), drop.color, min(ceil(drop.orig_count/4), 25), true);
              } else {
                drawBar(17, y, min(50, ceil(drop.count / 2)), drop.color, 25, false);
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

          select_vial = slot_idx;

          self.vial_menu = false;
          self.menu = {
            '[0] Cancel ': 'choice2',
          };
          let midx = 1;
          if (slot.color) {
            self.menu[`[${midx++}] Drain Vial `] = function () {
              select_vial = null;
              // TODO: animation
              slot.color = null;
              eda_draw_once = true;
              gameState('choice2');
            };
          }
          function fillVial(drop_idx) {
            select_vial = null;
            let drop = drops[drop_idx];
            if (!slot.color) {
              slot.color = drop.color;
              slot.count = 0;
              slot.level = min(drop.level, slot.max_level);
              slot.volatile = drop.volatile;
            }
            slot.level = min(drop.level, slot.level);
            slot.volatile = min(slot.volatile, drop.volatile);
            if (drop.count + slot.count >= 100) {
              // TODO: sound?
              // TODO: display a message when it refreshes the screen?
              distill_last_message = `Vial filled, crystalized 1 ${itemBright(slot)}!`;
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
            eda_draw_once = true;
            gameState('choice2');
          }
          for (let ii = 0; ii < drops.length; ++ii) {
            let drop = drops[ii];
            if (!slot.color && slot.max_level >= drop.level ||
              slot.color === drop.color && slot.level === drop.level
            ) {
              self.menu[`[${midx++}] Fill with ${itemBright(drop)}`] = fillVial.bind(self, ii);
            } else if (!slot.color || slot.color === drop.color) {
              let min_level = min(drop.level, slot.max_level);
              if (slot.color) {
                min_level = min(min_level, slot.level);
              }
              let label = `[${midx++}] Fill with ${itemBright(drop)} (dilute to L${min_level}) `;
              self.menu[label] = fillVial.bind(self, ii);
            }
          }
          terminal.subViewPop();
          refreshMenuPos();
        }
        let y = showStatus();
        if (distill_last_message) {
          y++;
          terminal.print({
            x: 1, y,
            fg: 10, bg: 0,
            text: distill_last_message + '\r\n'
          });
          y++;
          y++;
          distill_last_message = null;
        }
        this.vial_menu = {};
        if (!drops.length) {
          terminal.print({
            x: 1, y,
            fg: 7, bg: 0,
            text: '\r\n All essence processed.  Volatile vials may explode on\r\n' +
              ' the journey back to town.  Drain additional vials if\r\n' +
              ' desired.\r\n',
          });

          this.vial_menu.cancel = {
            label: '[0] Back to town! ',
            func: function () {
              addText('\r\n\n');
              adjustMarketPrices();
              gameState('home');
            },
          };
        } else {
          terminal.print({
            x: 1, y,
            fg: 7, bg: 0,
            text: 'Select a vial to drain or fill.\r\n'
          });
        }
        this.vial_menu.func = selectVial;
        this.menu = null;
        // for (let ii = 0; ii < game_state.eda.length; ++ii) {
        //   let slot = game_state.eda[ii];
        //   if (slot) {
        //     let label = `[${ii+1}] L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'} `;
        //     this.menu[label] = selectVial.bind(this, ii);
        //   }
        // }
        terminal.subViewPop();
        refreshMenuPos();
      },
    },
    home: {
      menu: {
        '[0] Continue ': '',
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
              '[0] Continue ': next_state,
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
    let key_count = st.menu ? Object.keys(st.menu).length : 1;
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
      diviner: 0,
      divined: {},
      ventures: 0,
      hp: 100,
      maxhp: 100,
      gp: START_GP,
      earned_gp: START_GP,
      inventory: [],
      eda: [null, null, null, null, null],
    };
    adjustMarketPrices();
    if (engine.DEBUG && true) {
      game_state.gp = 50001;
      // game_state.hp = 90;
      game_state.diviner = 1;
      game_state.inventory.push({ count: 2, level: 1, color: 'magenta' },
        { count: 2, level: 1, color: 'blue' },
        { count: 2, level: 2, color: 'blue' });
      game_state.eda[0] = {
        max_level: 1,
      };
      game_state.eda[1] = {
        max_level: 1,
        // max_level: 2,
        color: 'blue',
        level: 1,
        count: 90,
        volatile: 3,
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
      if (w) {
        terminal.fill({
          x, y, w, h: 1,
          ch: '█',
          fg, bg,
        });
      }
      terminal.print({
        x: x + w, y,
        text: '▌',
        fg, bg,
      });
      w++;
    } else {
      if (w) {
        terminal.fill({
          x, y, w, h: 1,
          ch: '█',
          fg, bg,
        });
      }
    }
    if (max_w - w) {
      terminal.fill({
        x: x + w, y, w: max_w - w, h: 1,
        ch: ' ',
        fg, bg,
      });
    }
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
        text: padRight(`COIN: ${cost(game_state.gp)}  `, STATUS_W - 2),
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
    function drawEDA() {
      eda_draw_once = false;
      for (let ii = 0; ii < game_state.eda.length; ++ii) {
        let slot = game_state.eda[ii];
        let prefix = ansi.blue.bright(` ${ii === game_state.eda.length - 1 ? '└' : '├'}${ii+1}─ `);
        let y = DISTILL_Y + 1 + 2 * ii;
        let label = prefix +
          (!slot ?
            ansi.white('Unoccupied expansion slot') :
            `L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'}`);
        let selected = select_vial === ii;
        terminal.print({
          x: 0, y,
          text: padRight(label, 30),
          fg: selected ? 15 : 0, bg: selected ? 1 : 8,
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
            if (percent > 10) {
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
    let st = STATES[game_state.state];
    if (!st || !st.vial_menu || eda_draw_once) {
      drawEDA();
    }

    if (st && st.vial_menu) {
      let menu_items = [];
      let ret_map = [];
      if (st.vial_menu.cancel) {
        menu_items.push(st.vial_menu.cancel.label);
        ret_map[0] = st.vial_menu.cancel.func;
      }
      let filter = st.vial_menu.filter || ((slot) => slot);
      for (let ii = 0; ii < game_state.eda.length; ++ii) {
        let slot = game_state.eda[ii];
        if (filter(slot)) {
          let label;
          if (slot) {
            label = `L${slot.max_level} Vial: ${slot.color ? itemBright(slot) : 'Empty'} `;
          } else {
            label = 'Unoccupied expansion slot';
          }
          let y = DISTILL_Y + 1 + 2 * ii;
          let prefix = ansi.blue.bright(` ${ii === game_state.eda.length - 1 ? '└' : '├'}${ii+1}─ `);
          menu_items.push({
            x: 0,
            y,
            label,
            color_sel: { fg: 15, bg: 1 },
            color_unsel: { fg: 0, bg: 8 },
            color_execute: { fg: 14, bg: 8 },
            pre_sel: prefix,
            pre_unsel: prefix,
            hotkey: String(ii+1),
          });
          ret_map.push(st.vial_menu.func.bind(null, ii));
        }
      }
      let ret = terminal.menu({
        pre_sel: ' ■ ',
        pre_unsel: '   ',
        x: game_state.menu_x,
        y: game_state.menu_y,
        items: menu_items,
        color_sel: { fg: 15, bg: 1 },
        color_unsel: { fg: 9, bg: 0 },
        color_execute: { fg: 15, bg: 0 },
      });
      if (ret !== -1) {
        ret_map[ret]();
      }

    } else if (st && st.menu) {
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
        key: st.menu_key,
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

  function encodeScore(score) {
    assert(score.gp >= 0 && score.ventures >= 0);
    return score.gp * 10000 +
      score.ventures;
  }

  function parseScore(value) {
    let gp = floor(value / 10000);
    value -= gp * 10000;
    let ventures = value;
    return { gp, ventures };
  }

  let levels = [
    {
      name: 'main',
      display_name: 'Main',
    },
  ];
  score_system.init(encodeScore, parseScore, levels, 'LD49');
  score_system.updateHighScores();

  engine.setState(menuInit);
}
