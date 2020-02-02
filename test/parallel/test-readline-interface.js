// Copyright Joyent, Inc. and other Node contributors.
//
// Permission is hereby granted, free of charge, to any person obtaining a
// copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including
// without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit
// persons to whom the Software is furnished to do so, subject to the
// following conditions:
//
// The above copyright notice and this permission notice shall be included
// in all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS
// OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
// MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN
// NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
// DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
// OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE
// USE OR OTHER DEALINGS IN THE SOFTWARE.

// Flags: --expose_internals
'use strict';
const common = require('../common');

const assert = require('assert');
const readline = require('readline');
const {
  getStringWidth,
  stripVTControlCharacters
} = require('internal/util/inspect');
const EventEmitter = require('events').EventEmitter;
const { Writable, Readable } = require('stream');

class FakeInput extends EventEmitter {
  resume() {}
  pause() {}
  write() {}
  end() {}
}

function isWarned(emitter) {
  for (const name in emitter) {
    const listeners = emitter[name];
    if (listeners.warned) return true;
  }
  return false;
}

{
  // Default crlfDelay is 100ms
  const fi = new FakeInput();
  const rli = new readline.Interface({ input: fi, output: fi });
  assert.strictEqual(rli.crlfDelay, 100);
  rli.close();
}

{
  // Minimum crlfDelay is 100ms
  const fi = new FakeInput();
  const rli = new readline.Interface({ input: fi, output: fi, crlfDelay: 0 });
  assert.strictEqual(rli.crlfDelay, 100);
  rli.close();
}

{
  // Set crlfDelay to float 100.5ms
  const fi = new FakeInput();
  const rli = new readline.Interface({
    input: fi,
    output: fi,
    crlfDelay: 100.5
  });
  assert.strictEqual(rli.crlfDelay, 100.5);
  rli.close();
}

{
  // Set crlfDelay to 5000ms
  const fi = new FakeInput();
  const rli = new readline.Interface({
    input: fi,
    output: fi,
    crlfDelay: 5000
  });
  assert.strictEqual(rli.crlfDelay, 5000);
  rli.close();
}

[ true, false ].forEach(function(terminal) {
  // disable history
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal, historySize: 0 }
    );
    assert.strictEqual(rli.historySize, 0);

    fi.emit('data', 'asdf\n');
    assert.deepStrictEqual(rli.history, terminal ? [] : undefined);
    rli.close();
  }

  // Default history size 30
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    assert.strictEqual(rli.historySize, 30);

    fi.emit('data', 'asdf\n');
    assert.deepStrictEqual(rli.history, terminal ? ['asdf'] : undefined);
    rli.close();
  }

  // sending a full line
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    let called = false;
    rli.on('line', function(line) {
      called = true;
      assert.strictEqual(line, 'asdf');
    });
    fi.emit('data', 'asdf\n');
    assert.ok(called);
  }

  // Sending a blank line
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    let called = false;
    rli.on('line', function(line) {
      called = true;
      assert.strictEqual(line, '');
    });
    fi.emit('data', '\n');
    assert.ok(called);
  }

  // Sending a single character with no newline
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(fi, {});
    let called = false;
    rli.on('line', function(line) {
      called = true;
    });
    fi.emit('data', 'a');
    assert.ok(!called);
    rli.close();
  }

  // Sending a single character with no newline and then a newline
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    let called = false;
    rli.on('line', function(line) {
      called = true;
      assert.strictEqual(line, 'a');
    });
    fi.emit('data', 'a');
    assert.ok(!called);
    fi.emit('data', '\n');
    assert.ok(called);
    rli.close();
  }

  // Sending multiple newlines at once
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    const expectedLines = ['foo', 'bar', 'baz'];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    fi.emit('data', `${expectedLines.join('\n')}\n`);
    assert.strictEqual(callCount, expectedLines.length);
    rli.close();
  }

  // Sending multiple newlines at once that does not end with a new line
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    const expectedLines = ['foo', 'bar', 'baz', 'bat'];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    fi.emit('data', expectedLines.join('\n'));
    assert.strictEqual(callCount, expectedLines.length - 1);
    rli.close();
  }

  // Sending multiple newlines at once that does not end with a new(empty)
  // line and a `end` event
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    const expectedLines = ['foo', 'bar', 'baz', ''];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    rli.on('close', function() {
      callCount++;
    });
    fi.emit('data', expectedLines.join('\n'));
    fi.emit('end');
    assert.strictEqual(callCount, expectedLines.length);
    rli.close();
  }

  // Sending multiple newlines at once that does not end with a new line
  // and a `end` event(last line is)

  // \r should behave like \n when alone
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: true }
    );
    const expectedLines = ['foo', 'bar', 'baz', 'bat'];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    fi.emit('data', expectedLines.join('\r'));
    assert.strictEqual(callCount, expectedLines.length - 1);
    rli.close();
  }

  // \r at start of input should output blank line
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: true }
    );
    const expectedLines = ['', 'foo' ];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    fi.emit('data', '\rfoo\r');
    assert.strictEqual(callCount, expectedLines.length);
    rli.close();
  }

  // Emit two line events when the delay
  // between \r and \n exceeds crlfDelay
  {
    const fi = new FakeInput();
    const delay = 200;
    const rli = new readline.Interface({
      input: fi,
      output: fi,
      terminal: terminal,
      crlfDelay: delay
    });
    let callCount = 0;
    rli.on('line', function(line) {
      callCount++;
    });
    fi.emit('data', '\r');
    setTimeout(common.mustCall(() => {
      fi.emit('data', '\n');
      assert.strictEqual(callCount, 2);
      rli.close();
    }), delay * 2);
  }

  // Set crlfDelay to `Infinity` is allowed
  {
    const fi = new FakeInput();
    const delay = 200;
    const crlfDelay = Infinity;
    const rli = new readline.Interface({
      input: fi,
      output: fi,
      terminal: terminal,
      crlfDelay
    });
    let callCount = 0;
    rli.on('line', function(line) {
      callCount++;
    });
    fi.emit('data', '\r');
    setTimeout(common.mustCall(() => {
      fi.emit('data', '\n');
      assert.strictEqual(callCount, 1);
      rli.close();
    }), delay);
  }

  // \t when there is no completer function should behave like an ordinary
  // character
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: true }
    );
    let called = false;
    rli.on('line', function(line) {
      assert.strictEqual(line, '\t');
      assert.strictEqual(called, false);
      called = true;
    });
    fi.emit('data', '\t');
    fi.emit('data', '\n');
    assert.ok(called);
    rli.close();
  }

  // \t does not become part of the input when there is a completer function
  {
    const fi = new FakeInput();
    const completer = (line) => [[], line];
    const rli = new readline.Interface({
      input: fi,
      output: fi,
      terminal: true,
      completer: completer
    });
    let called = false;
    rli.on('line', function(line) {
      assert.strictEqual(line, 'foo');
      assert.strictEqual(called, false);
      called = true;
    });
    for (const character of '\tfo\to\t') {
      fi.emit('data', character);
    }
    fi.emit('data', '\n');
    assert.ok(called);
    rli.close();
  }

  // Constructor throws if completer is not a function or undefined
  {
    const fi = new FakeInput();
    assert.throws(() => {
      readline.createInterface({
        input: fi,
        completer: 'string is not valid'
      });
    }, {
      name: 'TypeError',
      code: 'ERR_INVALID_OPT_VALUE'
    });

    assert.throws(() => {
      readline.createInterface({
        input: fi,
        completer: ''
      });
    }, {
      name: 'TypeError',
      code: 'ERR_INVALID_OPT_VALUE'
    });

    assert.throws(() => {
      readline.createInterface({
        input: fi,
        completer: false
      });
    }, {
      name: 'TypeError',
      code: 'ERR_INVALID_OPT_VALUE'
    });
  }

  // Constructor throws if historySize is not a positive number
  {
    const fi = new FakeInput();
    assert.throws(() => {
      readline.createInterface({
        input: fi, historySize: 'not a number'
      });
    }, {
      name: 'RangeError',
      code: 'ERR_INVALID_OPT_VALUE'
    });

    assert.throws(() => {
      readline.createInterface({
        input: fi, historySize: -1
      });
    }, {
      name: 'RangeError',
      code: 'ERR_INVALID_OPT_VALUE'
    });

    assert.throws(() => {
      readline.createInterface({
        input: fi, historySize: NaN
      });
    }, {
      name: 'RangeError',
      code: 'ERR_INVALID_OPT_VALUE'
    });
  }

  // Duplicate lines are removed from history when
  // `options.removeHistoryDuplicates` is `true`
  {
    const fi = new FakeInput();
    const rli = new readline.Interface({
      input: fi,
      output: fi,
      terminal: true,
      removeHistoryDuplicates: true
    });
    const expectedLines = ['foo', 'bar', 'baz', 'bar', 'bat', 'bat'];
    // ['foo', 'baz', 'bar', bat'];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    fi.emit('data', `${expectedLines.join('\n')}\n`);
    assert.strictEqual(callCount, expectedLines.length);
    fi.emit('keypress', '.', { name: 'up' }); // 'bat'
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    fi.emit('keypress', '.', { name: 'up' }); // 'bar'
    assert.notStrictEqual(rli.line, expectedLines[--callCount]);
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    fi.emit('keypress', '.', { name: 'up' }); // 'baz'
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    fi.emit('keypress', '.', { name: 'up' }); // 'foo'
    assert.notStrictEqual(rli.line, expectedLines[--callCount]);
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    assert.strictEqual(callCount, 0);
    fi.emit('keypress', '.', { name: 'down' }); // 'baz'
    assert.strictEqual(rli.line, 'baz');
    assert.strictEqual(rli.historyIndex, 2);
    fi.emit('keypress', '.', { name: 'n', ctrl: true }); // 'bar'
    assert.strictEqual(rli.line, 'bar');
    assert.strictEqual(rli.historyIndex, 1);
    fi.emit('keypress', '.', { name: 'n', ctrl: true });
    assert.strictEqual(rli.line, 'bat');
    assert.strictEqual(rli.historyIndex, 0);
    // Activate the substring history search.
    fi.emit('keypress', '.', { name: 'down' }); // 'bat'
    assert.strictEqual(rli.line, 'bat');
    assert.strictEqual(rli.historyIndex, -1);
    // Deactivate substring history search.
    fi.emit('keypress', '.', { name: 'backspace' }); // 'ba'
    assert.strictEqual(rli.historyIndex, -1);
    assert.strictEqual(rli.line, 'ba');
    // Activate the substring history search.
    fi.emit('keypress', '.', { name: 'down' }); // 'ba'
    assert.strictEqual(rli.historyIndex, -1);
    assert.strictEqual(rli.line, 'ba');
    fi.emit('keypress', '.', { name: 'down' }); // 'ba'
    assert.strictEqual(rli.historyIndex, -1);
    assert.strictEqual(rli.line, 'ba');
    fi.emit('keypress', '.', { name: 'up' }); // 'bat'
    assert.strictEqual(rli.historyIndex, 0);
    assert.strictEqual(rli.line, 'bat');
    fi.emit('keypress', '.', { name: 'up' }); // 'bar'
    assert.strictEqual(rli.historyIndex, 1);
    assert.strictEqual(rli.line, 'bar');
    fi.emit('keypress', '.', { name: 'up' }); // 'baz'
    assert.strictEqual(rli.historyIndex, 2);
    assert.strictEqual(rli.line, 'baz');
    fi.emit('keypress', '.', { name: 'up' }); // 'ba'
    assert.strictEqual(rli.historyIndex, 4);
    assert.strictEqual(rli.line, 'ba');
    fi.emit('keypress', '.', { name: 'up' }); // 'ba'
    assert.strictEqual(rli.historyIndex, 4);
    assert.strictEqual(rli.line, 'ba');
    // Deactivate substring history search and reset history index.
    fi.emit('keypress', '.', { name: 'right' }); // 'ba'
    assert.strictEqual(rli.historyIndex, -1);
    assert.strictEqual(rli.line, 'ba');
    // Substring history search activated.
    fi.emit('keypress', '.', { name: 'up' }); // 'ba'
    assert.strictEqual(rli.historyIndex, 0);
    assert.strictEqual(rli.line, 'bat');
    rli.close();
  }

  // Duplicate lines are not removed from history when
  // `options.removeHistoryDuplicates` is `false`
  {
    const fi = new FakeInput();
    const rli = new readline.Interface({
      input: fi,
      output: fi,
      terminal: true,
      removeHistoryDuplicates: false
    });
    const expectedLines = ['foo', 'bar', 'baz', 'bar', 'bat', 'bat'];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    fi.emit('data', `${expectedLines.join('\n')}\n`);
    assert.strictEqual(callCount, expectedLines.length);
    fi.emit('keypress', '.', { name: 'up' }); // 'bat'
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    fi.emit('keypress', '.', { name: 'up' }); // 'bar'
    assert.notStrictEqual(rli.line, expectedLines[--callCount]);
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    fi.emit('keypress', '.', { name: 'up' }); // 'baz'
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    fi.emit('keypress', '.', { name: 'up' }); // 'bar'
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    fi.emit('keypress', '.', { name: 'up' }); // 'foo'
    assert.strictEqual(rli.line, expectedLines[--callCount]);
    assert.strictEqual(callCount, 0);
    rli.close();
  }

  // Sending a multi-byte utf8 char over multiple writes
  {
    const buf = Buffer.from('☮', 'utf8');
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    let callCount = 0;
    rli.on('line', function(line) {
      callCount++;
      assert.strictEqual(line, buf.toString('utf8'));
    });
    [].forEach.call(buf, function(i) {
      fi.emit('data', Buffer.from([i]));
    });
    assert.strictEqual(callCount, 0);
    fi.emit('data', '\n');
    assert.strictEqual(callCount, 1);
    rli.close();
  }

  // Regression test for repl freeze, #1968:
  // check that nothing fails if 'keypress' event throws.
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: true }
    );
    const keys = [];
    const err = new Error('bad thing happened');
    fi.on('keypress', function(key) {
      keys.push(key);
      if (key === 'X') {
        throw err;
      }
    });
    assert.throws(
      () => fi.emit('data', 'fooX'),
      (e) => {
        assert.strictEqual(e, err);
        return true;
      }
    );
    fi.emit('data', 'bar');
    assert.strictEqual(keys.join(''), 'fooXbar');
    rli.close();
  }

  // Calling readline without `new`
  {
    const fi = new FakeInput();
    const rli = readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    let called = false;
    rli.on('line', function(line) {
      called = true;
      assert.strictEqual(line, 'asdf');
    });
    fi.emit('data', 'asdf\n');
    assert.ok(called);
    rli.close();
  }

  // Calling the question callback
  {
    let called = false;
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: fi, terminal: terminal }
    );
    rli.question('foo?', function(answer) {
      called = true;
      assert.strictEqual(answer, 'bar');
    });
    rli.write('bar\n');
    assert.ok(called);
    rli.close();
  }

  if (terminal) {
    // history is bound
    {
      const fi = new FakeInput();
      const rli = new readline.Interface(
        { input: fi, output: fi, terminal, historySize: 2 }
      );
      const lines = ['line 1', 'line 2', 'line 3'];
      fi.emit('data', lines.join('\n') + '\n');
      assert.strictEqual(rli.history.length, 2);
      assert.strictEqual(rli.history[0], 'line 3');
      assert.strictEqual(rli.history[1], 'line 2');
    }
    // question
    {
      const fi = new FakeInput();
      const rli = new readline.Interface(
        { input: fi, output: fi, terminal: terminal }
      );
      const expectedLines = ['foo'];
      rli.question(expectedLines[0], function() {
        rli.close();
      });
      const cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, expectedLines[0].length);
      rli.close();
    }

    // Sending a multi-line question
    {
      const fi = new FakeInput();
      const rli = new readline.Interface(
        { input: fi, output: fi, terminal: terminal }
      );
      const expectedLines = ['foo', 'bar'];
      rli.question(expectedLines.join('\n'), function() {
        rli.close();
      });
      const cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, expectedLines.length - 1);
      assert.strictEqual(cursorPos.cols, expectedLines.slice(-1)[0].length);
      rli.close();
    }

    {
      // Beginning and end of line
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', 'the quick brown fox');
      fi.emit('keypress', '.', { ctrl: true, name: 'a' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);
      fi.emit('keypress', '.', { ctrl: true, name: 'e' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 19);
      rli.close();
    }

    {
      // Back and Forward one character
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', 'the quick brown fox');
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 19);

      // Back one character
      fi.emit('keypress', '.', { ctrl: true, name: 'b' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 18);
      // Back one character
      fi.emit('keypress', '.', { ctrl: true, name: 'b' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 17);
      // Forward one character
      fi.emit('keypress', '.', { ctrl: true, name: 'f' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 18);
      // Forward one character
      fi.emit('keypress', '.', { ctrl: true, name: 'f' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 19);
      rli.close();
    }

    // Back and Forward one astral character
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', '💻');

      // Move left one character/code point
      fi.emit('keypress', '.', { name: 'left' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);

      // Move right one character/code point
      fi.emit('keypress', '.', { name: 'right' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 2);

      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, '💻');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // Two astral characters left
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', '💻');

      // Move left one character/code point
      fi.emit('keypress', '.', { name: 'left' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);

      fi.emit('data', '🐕');
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 2);

      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, '🐕💻');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // Two astral characters right
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', '💻');

      // Move left one character/code point
      fi.emit('keypress', '.', { name: 'right' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 2);

      fi.emit('data', '🐕');
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 4);

      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, '💻🐕');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    {
      // `wordLeft` and `wordRight`
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', 'the quick brown fox');
      fi.emit('keypress', '.', { ctrl: true, name: 'left' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 16);
      fi.emit('keypress', '.', { meta: true, name: 'b' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 10);
      fi.emit('keypress', '.', { ctrl: true, name: 'right' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 16);
      fi.emit('keypress', '.', { meta: true, name: 'f' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 19);
      rli.close();
    }

    {
      // `deleteWordLeft`
      [
        { ctrl: true, name: 'w' },
        { ctrl: true, name: 'backspace' },
        { meta: true, name: 'backspace' }
      ]
        .forEach((deleteWordLeftKey) => {
          let fi = new FakeInput();
          let rli = new readline.Interface({
            input: fi,
            output: fi,
            prompt: '',
            terminal: terminal
          });
          fi.emit('data', 'the quick brown fox');
          fi.emit('keypress', '.', { ctrl: true, name: 'left' });
          rli.on('line', common.mustCall((line) => {
            assert.strictEqual(line, 'the quick fox');
          }));
          fi.emit('keypress', '.', deleteWordLeftKey);
          fi.emit('data', '\n');
          rli.close();

          // No effect if pressed at beginning of line
          fi = new FakeInput();
          rli = new readline.Interface({
            input: fi,
            output: fi,
            prompt: '',
            terminal: terminal
          });
          fi.emit('data', 'the quick brown fox');
          fi.emit('keypress', '.', { ctrl: true, name: 'a' });
          rli.on('line', common.mustCall((line) => {
            assert.strictEqual(line, 'the quick brown fox');
          }));
          fi.emit('keypress', '.', deleteWordLeftKey);
          fi.emit('data', '\n');
          rli.close();
        });
    }

    {
      // `deleteWordRight`
      [
        { ctrl: true, name: 'delete' },
        { meta: true, name: 'delete' },
        { meta: true, name: 'd' }
      ]
        .forEach((deleteWordRightKey) => {
          let fi = new FakeInput();
          let rli = new readline.Interface({
            input: fi,
            output: fi,
            prompt: '',
            terminal: terminal
          });
          fi.emit('data', 'the quick brown fox');
          fi.emit('keypress', '.', { ctrl: true, name: 'left' });
          fi.emit('keypress', '.', { ctrl: true, name: 'left' });
          rli.on('line', common.mustCall((line) => {
            assert.strictEqual(line, 'the quick fox');
          }));
          fi.emit('keypress', '.', deleteWordRightKey);
          fi.emit('data', '\n');
          rli.close();

          // No effect if pressed at end of line
          fi = new FakeInput();
          rli = new readline.Interface({
            input: fi,
            output: fi,
            prompt: '',
            terminal: terminal
          });
          fi.emit('data', 'the quick brown fox');
          rli.on('line', common.mustCall((line) => {
            assert.strictEqual(line, 'the quick brown fox');
          }));
          fi.emit('keypress', '.', deleteWordRightKey);
          fi.emit('data', '\n');
          rli.close();
        });
    }

    // deleteLeft
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', 'the quick brown fox');
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 19);

      // Delete left character
      fi.emit('keypress', '.', { ctrl: true, name: 'h' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 18);
      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, 'the quick brown fo');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // deleteLeft astral character
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', '💻');
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 2);
      // Delete left character
      fi.emit('keypress', '.', { ctrl: true, name: 'h' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);
      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, '');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // deleteRight
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', 'the quick brown fox');

      // Go to the start of the line
      fi.emit('keypress', '.', { ctrl: true, name: 'a' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);

      // Delete right character
      fi.emit('keypress', '.', { ctrl: true, name: 'd' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);
      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, 'he quick brown fox');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // deleteRight astral character
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', '💻');

      // Go to the start of the line
      fi.emit('keypress', '.', { ctrl: true, name: 'a' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);

      // Delete right character
      fi.emit('keypress', '.', { ctrl: true, name: 'd' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);
      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, '');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // deleteLineLeft
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', 'the quick brown fox');
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 19);

      // Delete from current to start of line
      fi.emit('keypress', '.', { ctrl: true, shift: true, name: 'backspace' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);
      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, '');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // deleteLineRight
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.emit('data', 'the quick brown fox');

      // Go to the start of the line
      fi.emit('keypress', '.', { ctrl: true, name: 'a' });
      let cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);

      // Delete from current to end of line
      fi.emit('keypress', '.', { ctrl: true, shift: true, name: 'delete' });
      cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 0);
      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, '');
      }));
      fi.emit('data', '\n');
      rli.close();
    }

    // Multi-line input cursor position
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      fi.columns = 10;
      fi.emit('data', 'multi-line text');
      const cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 1);
      assert.strictEqual(cursorPos.cols, 5);
      rli.close();
    }

    // Multi-line prompt cursor position
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '\nfilledline\nwraping text\n> ',
        terminal: terminal
      });
      fi.columns = 10;
      fi.emit('data', 't');
      const cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 4);
      assert.strictEqual(cursorPos.cols, 3);
      rli.close();
    }

    // Clear the whole screen
    {
      const fi = new FakeInput();
      const rli = new readline.Interface({
        input: fi,
        output: fi,
        prompt: '',
        terminal: terminal
      });
      const lines = ['line 1', 'line 2', 'line 3'];
      fi.emit('data', lines.join('\n'));
      fi.emit('keypress', '.', { ctrl: true, name: 'l' });
      const cursorPos = rli.getCursorPos();
      assert.strictEqual(cursorPos.rows, 0);
      assert.strictEqual(cursorPos.cols, 6);
      rli.on('line', common.mustCall((line) => {
        assert.strictEqual(line, 'line 3');
      }));
      fi.emit('data', '\n');
      rli.close();
    }
  }

  // Wide characters should be treated as two columns.
  assert.strictEqual(getStringWidth('a'), 1);
  assert.strictEqual(getStringWidth('あ'), 2);
  assert.strictEqual(getStringWidth('谢'), 2);
  assert.strictEqual(getStringWidth('고'), 2);
  assert.strictEqual(getStringWidth(String.fromCodePoint(0x1f251)), 2);
  assert.strictEqual(getStringWidth('abcde'), 5);
  assert.strictEqual(getStringWidth('古池や'), 6);
  assert.strictEqual(getStringWidth('ノード.js'), 9);
  assert.strictEqual(getStringWidth('你好'), 4);
  assert.strictEqual(getStringWidth('안녕하세요'), 10);
  assert.strictEqual(getStringWidth('A\ud83c\ude00BC'), 5);
  assert.strictEqual(getStringWidth('👨‍👩‍👦‍👦'), 8);
  assert.strictEqual(getStringWidth('🐕𐐷あ💻😀'), 9);
  // TODO(BridgeAR): This should have a width of 4.
  assert.strictEqual(getStringWidth('⓬⓪'), 2);
  assert.strictEqual(getStringWidth('\u0301\u200D\u200E'), 0);

  // Check if vt control chars are stripped
  assert.strictEqual(
    stripVTControlCharacters('\u001b[31m> \u001b[39m'),
    '> '
  );
  assert.strictEqual(
    stripVTControlCharacters('\u001b[31m> \u001b[39m> '),
    '> > '
  );
  assert.strictEqual(
    stripVTControlCharacters('\u001b[31m\u001b[39m'),
    ''
  );
  assert.strictEqual(
    stripVTControlCharacters('> '),
    '> '
  );
  assert.strictEqual(getStringWidth('\u001b[31m> \u001b[39m'), 2);
  assert.strictEqual(getStringWidth('\u001b[31m> \u001b[39m> '), 4);
  assert.strictEqual(getStringWidth('\u001b[31m\u001b[39m'), 0);
  assert.strictEqual(getStringWidth('> '), 2);

  {
    const fi = new FakeInput();
    assert.deepStrictEqual(fi.listeners(terminal ? 'keypress' : 'data'), []);
  }

  // check EventEmitter memory leak
  for (let i = 0; i < 12; i++) {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });
    rl.close();
    assert.strictEqual(isWarned(process.stdin._events), false);
    assert.strictEqual(isWarned(process.stdout._events), false);
  }

  // Can create a new readline Interface with a null output argument
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      { input: fi, output: null, terminal: terminal }
    );

    let called = false;
    rli.on('line', function(line) {
      called = true;
      assert.strictEqual(line, 'asdf');
    });
    fi.emit('data', 'asdf\n');
    assert.ok(called);

    rli.setPrompt('ddd> ');
    rli.prompt();
    rli.write('really shouldnt be seeing this');
    rli.question('What do you think of node.js? ', function(answer) {
      console.log('Thank you for your valuable feedback:', answer);
      rli.close();
    });
  }

  {
    const expected = terminal ?
      ['\u001b[1G', '\u001b[0J', '$ ', '\u001b[3G'] :
      ['$ '];

    let counter = 0;
    const output = new Writable({
      write: common.mustCall((chunk, enc, cb) => {
        assert.strictEqual(chunk.toString(), expected[counter++]);
        cb();
        rl.close();
      }, expected.length)
    });

    const rl = readline.createInterface({
      input: new Readable({ read: common.mustCall() }),
      output: output,
      prompt: '$ ',
      terminal: terminal
    });

    rl.prompt();

    assert.strictEqual(rl._prompt, '$ ');
  }
});

// For the purposes of the following tests, we do not care about the exact
// value of crlfDelay, only that the behaviour conforms to what's expected.
// Setting it to Infinity allows the test to succeed even under extreme
// CPU stress.
const crlfDelay = Infinity;

[ true, false ].forEach(function(terminal) {
  // Sending multiple newlines at once that does not end with a new line
  // and a `end` event(last line is)

  // \r\n should emit one line event, not two
  {
    const fi = new FakeInput();
    const rli = new readline.Interface(
      {
        input: fi,
        output: fi,
        terminal: terminal,
        crlfDelay
      }
    );
    const expectedLines = ['foo', 'bar', 'baz', 'bat'];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    fi.emit('data', expectedLines.join('\r\n'));
    assert.strictEqual(callCount, expectedLines.length - 1);
    rli.close();
  }

  // \r\n should emit one line event when split across multiple writes.
  {
    const fi = new FakeInput();
    const rli = new readline.Interface({
      input: fi,
      output: fi,
      terminal: terminal,
      crlfDelay
    });
    const expectedLines = ['foo', 'bar', 'baz', 'bat'];
    let callCount = 0;
    rli.on('line', function(line) {
      assert.strictEqual(line, expectedLines[callCount]);
      callCount++;
    });
    expectedLines.forEach(function(line) {
      fi.emit('data', `${line}\r`);
      fi.emit('data', '\n');
    });
    assert.strictEqual(callCount, expectedLines.length);
    rli.close();
  }

  // Emit one line event when the delay between \r and \n is
  // over the default crlfDelay but within the setting value.
  {
    const fi = new FakeInput();
    const delay = 125;
    const rli = new readline.Interface({
      input: fi,
      output: fi,
      terminal: terminal,
      crlfDelay
    });
    let callCount = 0;
    rli.on('line', () => callCount++);
    fi.emit('data', '\r');
    setTimeout(common.mustCall(() => {
      fi.emit('data', '\n');
      assert.strictEqual(callCount, 1);
      rli.close();
    }), delay);
  }
});

// Ensure that the _wordLeft method works even for large input
{
  const input = new Readable({
    read() {
      this.push('\x1B[1;5D'); // CTRL + Left
      this.push(null);
    },
  });
  const output = new Writable({
    write: common.mustCall((data, encoding, cb) => {
      assert.strictEqual(rl.cursor, rl.line.length - 1);
      cb();
    }),
  });
  const rl = new readline.createInterface({
    input: input,
    output: output,
    terminal: true,
  });
  rl.line = `a${' '.repeat(1e6)}a`;
  rl.cursor = rl.line.length;
}
