(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? factory(exports) :
	typeof define === 'function' && define.amd ? define(['exports'], factory) :
	(factory((global.pell = {})));
}(this, (function (exports) { 'use strict';

var _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; };

var defaultParagraphSeparatorString = 'defaultParagraphSeparator';
var formatBlock = 'formatBlock';
var addEventListener = function addEventListener(parent, type, listener) {
  return parent.addEventListener(type, listener);
};
var appendChild = function appendChild(parent, child) {
  return parent.appendChild(child);
};
var createElement = function createElement(tag) {
  return document.createElement(tag);
};
var queryCommandState = function queryCommandState(command) {
  return document.queryCommandState(command);
};
var queryCommandValue = function queryCommandValue(command) {
  return document.queryCommandValue(command);
};

var exec = function exec(command) {
  var value = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : null;
  return document.execCommand(command, false, value);
};

var defaultActions = {
  bold: {
    shortcut: 'b',
    icon: '<b>B</b>',
    title: 'Bold',
    state: function state() {
      return queryCommandState('bold');
    },
    result: function result() {
      return exec('bold');
    }
  },
  italic: {
    shortcut: 'i',
    icon: '<i>I</i>',
    title: 'Italic',
    state: function state() {
      return queryCommandState('italic');
    },
    result: function result() {
      return exec('italic');
    }
  },
  underline: {
    shortcut: 'u',
    icon: '<u>U</u>',
    title: 'Underline',
    state: function state() {
      return queryCommandState('underline');
    },
    result: function result() {
      return exec('underline');
    }
  },
  strikethrough: {
    shortcut: 'shift+x',
    icon: '<strike>S</strike>',
    title: 'Strike-through',
    state: function state() {
      return queryCommandState('strikeThrough');
    },
    result: function result() {
      return exec('strikeThrough');
    }
  },
  heading1: {
    icon: '<b>H<sub>1</sub></b>',
    title: 'Heading 1',
    result: function result() {
      return exec(formatBlock, '<h1>');
    }
  },
  heading2: {
    icon: '<b>H<sub>2</sub></b>',
    title: 'Heading 2',
    result: function result() {
      return exec(formatBlock, '<h2>');
    }
  },
  paragraph: {
    icon: '&#182;',
    title: 'Paragraph',
    result: function result() {
      return exec(formatBlock, '<p>');
    }
  },
  quote: {
    icon: '&#8220; &#8221;',
    title: 'Quote',
    result: function result() {
      return exec(formatBlock, '<blockquote>');
    }
  },
  olist: {
    shortcut: 'shift+7',
    icon: '&#35;',
    title: 'Ordered List',
    result: function result() {
      return exec('insertOrderedList');
    }
  },
  ulist: {
    shortcut: 'shift+8',
    icon: '&#8226;',
    title: 'Unordered List',
    result: function result() {
      return exec('insertUnorderedList');
    }
  },
  code: {
    icon: '&lt;/&gt;',
    title: 'Code',
    result: function result() {
      return exec(formatBlock, '<pre>');
    }
  },
  line: {
    icon: '&#8213;',
    title: 'Horizontal Line',
    result: function result() {
      return exec('insertHorizontalRule');
    }
  },
  link: {
    shortcut: 'k',
    icon: '&#128279;',
    title: 'Link',
    result: function result() {
      var url = window.prompt('Enter the link URL');
      if (url) exec('createLink', url);
    }
  },
  image: {
    icon: '&#128247;',
    title: 'Image',
    result: function result() {
      var url = window.prompt('Enter the image URL');
      if (url) exec('insertImage', url);
    }
  }
};

var isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform);

var formatShortcut = function formatShortcut(shortcut, keyLabels) {
  var labels = keyLabels || {};
  var keys = shortcut.split('+').map(function (key) {
    if (key === 'shift') return isMac ? '\u21E7' : labels.shift || 'Shift';
    return key.toUpperCase();
  });
  return isMac ? '\u2318' + keys.join('') : (labels.ctrl || 'Ctrl') + '+' + keys.join('+');
};

var formatAriaShortcut = function formatAriaShortcut(shortcut) {
  var keys = shortcut.split('+').map(function (key) {
    return key === 'shift' ? 'Shift' : key.toUpperCase();
  });
  return (isMac ? 'Meta+' : 'Control+') + keys.join('+');
};

var getShortcut = function getShortcut(event) {
  if ((isMac ? !event.metaKey || event.ctrlKey : !event.ctrlKey || event.metaKey) || event.altKey) return '';
  var key = event.key.toLowerCase();
  if (event.code && event.code.indexOf('Digit') === 0) {
    key = event.code.slice(5);
  } else if (!/^[a-z]$/.test(key) && event.code && event.code.indexOf('Key') === 0) {
    key = event.code.slice(3).toLowerCase();
  }
  return (event.shiftKey ? 'shift+' : '') + key;
};

var defaultClasses = {
  actionbar: 'pell-actionbar',
  button: 'pell-button',
  content: 'pell-content',
  selected: 'pell-button-selected'
};

var init = function init(settings) {
  var actions = settings.actions ? settings.actions.map(function (action) {
    if (typeof action === 'string') return defaultActions[action];else if (defaultActions[action.name]) return _extends({}, defaultActions[action.name], action);
    return action;
  }) : Object.keys(defaultActions).map(function (action) {
    return defaultActions[action];
  });

  var classes = _extends({}, defaultClasses, settings.classes);

  var defaultParagraphSeparator = settings[defaultParagraphSeparatorString] || 'div';

  var actionbar = createElement('div');
  actionbar.className = classes.actionbar;
  if (settings.actionbarLabel) {
    actionbar.setAttribute('role', 'group');
    actionbar.setAttribute('aria-label', settings.actionbarLabel);
  }
  appendChild(settings.element, actionbar);

  var content = settings.element.content = createElement('div');
  content.contentEditable = true;
  content.className = classes.content;
  content.setAttribute('role', 'textbox');
  content.setAttribute('aria-multiline', 'true');
  if (settings.label) content.setAttribute('aria-label', settings.label);
  if (settings.labelledBy) content.setAttribute('aria-labelledby', settings.labelledBy);
  content.oninput = function (_ref) {
    var firstChild = _ref.target.firstChild;

    var placeholder = '<' + defaultParagraphSeparator + '><br></' + defaultParagraphSeparator + '>';

    if (firstChild && firstChild.nodeType === 3) {
      exec(formatBlock, '<' + defaultParagraphSeparator + '>');
      var blocks = content.querySelectorAll(defaultParagraphSeparator);
      if (blocks.length === 2 && blocks[1].outerHTML === placeholder && blocks[0].textContent.length > 0) blocks[1].remove();
    } else if (!content.innerHTML || content.innerHTML === '<br>') {
      content.innerHTML = placeholder;
    } else {
      var blocks = content.querySelectorAll(defaultParagraphSeparator);
      if (blocks.length === 2 && blocks[0].outerHTML === placeholder && blocks[1].textContent.length > 0) blocks[0].remove();
    }

    settings.onChange(content.innerHTML);
};
  content.onkeydown = function (event) {
    if (event.key === 'Enter' && queryCommandValue(formatBlock) === 'blockquote') {
      setTimeout(function () {
        return exec(formatBlock, '<' + defaultParagraphSeparator + '>');
      }, 0);
    }
  };
  appendChild(settings.element, content);

  var shortcuts = {};
  actions.forEach(function (action) {
    if (action.shortcut) shortcuts[action.shortcut] = action;
  });
  addEventListener(content, 'keydown', function (event) {
    var action = shortcuts[getShortcut(event)];
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    action.result();
  });

  actions.forEach(function (action) {
    var button = createElement('button');
    button.className = classes.button;
    button.innerHTML = action.icon;
    var label = action.shortcut ? action.title + ' (' + formatShortcut(action.shortcut, settings.keyLabels) + ')' : action.title;
    button.title = label;
    button.setAttribute('aria-label', label);
    if (action.shortcut) button.setAttribute('aria-keyshortcuts', formatAriaShortcut(action.shortcut));
    button.setAttribute('type', 'button');
    button.onclick = function () {
      return action.result() && content.focus();
    };

    if (action.state) {
      var handler = function handler() {
        var actif = false;
        try {
          var selection = window.getSelection();
          actif = !!(selection && content.contains(selection.anchorNode) && action.state());
        } catch (e) {
          actif = false;
        }
        button.classList[actif ? 'add' : 'remove'](classes.selected);
        button.setAttribute('aria-pressed', actif ? 'true' : 'false');
      };
      handler();
      addEventListener(content, 'keyup', handler);
      addEventListener(content, 'mouseup', handler);
      addEventListener(content, 'focus', handler);
      addEventListener(button, 'click', handler);
    }

    appendChild(actionbar, button);
  });

  if (settings.styleWithCSS) exec('styleWithCSS');
  exec(defaultParagraphSeparatorString, defaultParagraphSeparator);

  return settings.element;
};

var pell = { exec: exec, init: init };

exports.exec = exec;
exports.init = init;
exports['default'] = pell;

Object.defineProperty(exports, '__esModule', { value: true });

})));
