import {describe, it} from 'mocha'
import assert from 'assert'
import sinon from 'sinon'
import Cycle from '../lib'
import * as Rx from 'rxjs/Rx'
import rxAdapter from 'cycle-rx5-adapter'

describe('Cycle', function () {
  it('should be a function', () => {
    assert.strictEqual(typeof Cycle, 'function')
  })

  it('should throw if first argument is not a function', function () {
    assert.throws(() => {
      Cycle('not a function', {}, {streamAdapter: rxAdapter});
    }, /First argument given to Cycle\(\) must be the 'main' function/i);
  });

  it('should throw if second argument is not an object', function () {
    assert.throws(() => {
      Cycle(() => {}, 'not an object', {streamAdapter: rxAdapter});
    }, /Second argument given to Cycle\(\) must be an object with driver functions/i);
  });

  it('should throw if second argument is an empty object', function () {
    assert.throws(() => {
      Cycle(() => {}, {}, {streamAdapter: rxAdapter});
    }, /Second argument given to Cycle\(\) must be an object with at least one/i);
  });

  it('should throw if streamAdapter is not supplied', function () {
    assert.throws(() => {
      Cycle(() => {}, {other: () => {}}, {})
    }, /Third argument given to Cycle\(\) must be an object with the streamAdapter key supplied with a valid stream adapter/i)
  });

  it('should return sinks object and sources object and run()', function () {
    function app(ext) {
      return {
        other: ext.other.take(1).startWith('a')
      };
    }
    function driver() {
      return Rx.Observable.of('b');
    }
    let {sinks, sources, run} = Cycle(app, {other: driver}, {streamAdapter: rxAdapter});
    assert.strictEqual(typeof sinks, 'object');
    assert.strictEqual(typeof sinks.other.subscribe, 'function');
    assert.strictEqual(typeof sources, 'object');
    assert.notStrictEqual(typeof sources.other, 'undefined');
    assert.notStrictEqual(sources.other, null);
    assert.strictEqual(typeof sources.other.subscribe, 'function');
    assert.strictEqual(typeof run, 'function')
  });

  describe('run()', () => {
    it('should return a disposable drivers output', function (done) {
      function app(sources) {
        return {
          other: sources.other.take(6).map(x => String(x)).startWith('a')
        };
      }
      function driver(sink) {
        return sink.map(x => x.charCodeAt(0)).delay(1);
      }
      let {sinks, sources, run} = Cycle(app, {other: driver}, {streamAdapter: rxAdapter});

      sources.other.subscribe(x => {
        assert.strictEqual(x, 97);
      });

      const dispose = run();
      dispose();
      done();
    });

    it('should allow writing one-liner drivers with default streamAdapter', function(done) {
      function app(sources) {
        return {}
      }

      const {sinks, sources, run} = Cycle(app, {
        other: () => Rx.Observable.of(1, 2, 'Correct', 4),
      }, {streamAdapter: rxAdapter});

      sources.other.skip(2).take(1).subscribe(function(x) {
        assert.strictEqual(typeof x, 'string');
        assert.strictEqual(x, 'Correct');
      });

      const dispose = run();
      setTimeout(function() {
        dispose();
        done();
      }, 10)
    });

    it('should run synchronously', function () {
      function app() {
        return {
          other: Rx.Observable.from([9, 19, 29]),
        };
      }
      let mutable = 'wrong';
      function driver(sink) {
        return sink.map(x => 'a' + 9)
      }
      let {sinks, sources, run} = Cycle(app, {other: driver}, {streamAdapter: rxAdapter});

      sources.other.take(0).subscribe(x => {
        assert.strictEqual(x, 'a9');
        assert.strictEqual(mutable, 'correct');
      });
      mutable = 'correct';
      const dispose = run();
      dispose();
    });

    it('should not work after has been disposed', function (done) {
      let number$ = Rx.Observable.range(1, 3)
        .concatMap(x => Rx.Observable.of(x).delay(50));
      function app() {
        return {other: number$};
      }
      let {sinks, sources, run} = Cycle(app, {
        other: number$ => number$.map(number => 'x' + number)
      }, {streamAdapter: rxAdapter});

      const dispose = run();

      sources.other.subscribe(function (x) {
        assert.notStrictEqual(x, 'x3');
        if (x === 'x2') {
          dispose();
          setTimeout(() => {
            done();
          }, 100);
        }
      });

      it('should report errors from main() in the console', function (done) {
        let sandbox = sinon.sandbox.create();
        sandbox.stub(console, "error");

        function main(sources) {
          return {
            other: sources.other.take(1).startWith('a').map(() => {
              throw new Error('malfunction');
            })
          };
        }
        function driver() {
          return Rx.Observable.just('b');
        }

        Cycle(main, {other: driver}, {streamAdapter: rxAdapter}).run();
        setTimeout(() => {
          sinon.assert.calledOnce(console.error);
          sinon.assert.calledWithExactly(console.error, sinon.match("malfunction"));

          sandbox.restore();
          done();
        }, 10);
      });
    });
  });
});
