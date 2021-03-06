/* Setup */
var Lab = require('lab');
var Code = require('code');
var lab = exports.lab = Lab.script();

var describe = lab.describe;
var it = lab.it;
var before = lab.before;
var beforeEach = lab.beforeEach;
var after = lab.after;
var afterEach = lab.afterEach;
var expect = Code.expect;

/* Modules */
var EventEmitter = require('events').EventEmitter;
var simple = require('simple-mock');
var queue = require('../lib/adapters/redis');
var msb = require('..');
var config = require('../lib/config');
var channelManager = msb.channelManager;

describe('channelManager', function() {
  beforeEach(function(done) {
    simple.mock(config, 'redis', {
      host: 'mock.host',
      port: '99999'
    });
    simple.mock(config, 'schema', null);
    simple.mock(config, 'cleanupConsumers', true);
    done();
  });

  afterEach(function(done) {
    simple.restore();
    done();
  });

  describe('findOrCreateProducer', function() {
    beforeEach(function(done) {
      done();
    });

    it('can reuse publisher and channels per topic', function(done) {
      var mockPublisher = {};

      simple.mock(queue, 'Publish').returnWith(mockPublisher);

      simple
      .mock(mockPublisher, 'channel')
      .returnWith(1)
      .returnWith(2)
      .returnWith(null);

      var producer1a = channelManager.findOrCreateProducer('prod1:1');

      expect(mockPublisher.channel.called).true();
      expect(mockPublisher.channel.lastCall.args[0]).equals('prod1:1');

      var producer2 = channelManager.findOrCreateProducer('prod1:2');

      expect(mockPublisher.channel.lastCall.args[0]).equals('prod1:2');
      expect(mockPublisher.channel.called).true();

      var producer1b = channelManager.findOrCreateProducer('prod1:1');

      expect(queue.Publish.callCount).equals(1);
      expect(queue.Publish.lastCall.args[0]).to.deep.include({ host: 'mock.host' });
      expect(mockPublisher.channel.callCount).equals(2);
      expect(producer2).to.not.equal(producer1a);
      expect(producer1a).equals(producer1b);

      done();
    });

    it('will emit a new channel event', function(done) {
      simple.mock(channelManager, 'createRawProducer').returnWith({});

      expect(channelManager.PRODUCER_NEW_TOPIC_EVENT).exists();

      var onEvent = simple.mock();
      channelManager.on(channelManager.PRODUCER_NEW_TOPIC_EVENT, onEvent);

      channelManager.findOrCreateProducer('etc');

      expect(onEvent.called).true();
      expect(onEvent.lastCall.args[0]).equals('etc');
      done();
    });
  });

  describe('findOrCreateConsumer', function() {
    beforeEach(function(done) {
      simple.mock(channelManager, 'onNewChannel').returnWith();
      done();
    });

    it('can reuse subscribers per topic', function(done) {
      var mockSubscriber1 = {};
      var mockSubscriber2 = {};

      simple.mock(mockSubscriber1, 'setMaxListeners');
      simple.mock(mockSubscriber1, 'on');
      simple.mock(mockSubscriber2, 'setMaxListeners');
      simple.mock(mockSubscriber2, 'on');

      simple
      .mock(queue, 'Subscribe')
      .returnWith(mockSubscriber1)
      .returnWith(mockSubscriber2)
      .returnWith(null);

      var consumer1a = channelManager.findOrCreateConsumer('con1:1');

      expect(queue.Subscribe.called).true();
      expect(queue.Subscribe.lastCall.args[0]).deep.include({
        channel: 'con1:1',
        host: 'mock.host',
        port: '99999'
      });

      var consumer2 = channelManager.findOrCreateConsumer('con1:2');

      expect(queue.Subscribe.lastCall.args[0]).deep.include({
        channel: 'con1:2',
        host: 'mock.host',
        port: '99999'
      });

      var consumer1b = channelManager.findOrCreateConsumer('con1:1');

      expect(queue.Subscribe.callCount).equals(2);
      expect(consumer2).to.not.equal(consumer1a);
      expect(consumer1a).equals(consumer1b);
      done();
    });

    it('will emit a new channel event', function(done) {
      var mockSubscriber = {};
      simple.mock(mockSubscriber, 'setMaxListeners');
      simple.mock(mockSubscriber, 'on');
      simple.mock(channelManager, 'createRawConsumer').returnWith(mockSubscriber);

      expect(channelManager.CONSUMER_NEW_TOPIC_EVENT).exists();

      var onEvent = simple.mock();
      channelManager.once(channelManager.CONSUMER_NEW_TOPIC_EVENT, onEvent);
      channelManager.findOrCreateConsumer('etc');

      expect(onEvent.called).true();
      expect(onEvent.lastCall.args[0]).equals('etc');
      done();
    });

    it('will listen for messages and emit a new message event', function(done) {
      var mockSubscriber = {};
      simple.mock(mockSubscriber, 'on');
      simple.mock(channelManager, 'createRawConsumer').returnWith(mockSubscriber);

      var consumer = channelManager.findOrCreateConsumer('c:etc');

      expect(mockSubscriber.on.callCount).equals(1);
      expect(mockSubscriber.on.calls[0].args[0]).equals('message');
      expect(consumer.listeners('removeListener')).length(1);
      expect(channelManager.CONSUMER_NEW_MESSAGE_EVENT).exists();

      var onMessageFn = mockSubscriber.on.calls[0].args[1];
      var onEvent = simple.mock();
      channelManager.once(channelManager.CONSUMER_NEW_MESSAGE_EVENT, onEvent);

      // With expired message
      onMessageFn({ meta: { ttl: 1000, createdAt: new Date(Date.now() - 1001) } });
      expect(onEvent.called).false();

      // With normal message
      onMessageFn({});
      expect(onEvent.called).true();
      expect(onEvent.lastCall.args[0]).equals('c:etc');

      done();
    });

    describe('when the listeners are removed', function() {
      it('will remove the cached channel', function(done) {
        expect(channelManager.CONSUMER_REMOVED_TOPIC_EVENT).exists();

        var mockSubscriber = new EventEmitter();
        simple.mock(mockSubscriber, 'close').returnWith();
        simple.mock(channelManager, 'createRawConsumer').returnWith(mockSubscriber);

        var onEvent = simple.mock();
        channelManager.on(channelManager.CONSUMER_REMOVED_TOPIC_EVENT, onEvent);

        var channel = channelManager.findOrCreateConsumer('cr:etc');

        // Do nothing for other events
        channel.on('other', function() {});
        channel.removeAllListeners('other');

        var singleListener = function() {};
        channel.on('message', singleListener);
        channel.removeListener('message', singleListener);
        channel.removeListener('message', singleListener);

        setImmediate(function() {
          expect(mockSubscriber.close.callCount).equals(1);
          expect(channelManager.createRawConsumer.callCount).equals(1);
          expect(onEvent.callCount).equals(1);

          // Cache was cleared
          channelManager.findOrCreateConsumer('cr:etc');
          expect(channelManager.createRawConsumer.callCount).equals(2);

          done();
        });
      });

      it('will remove multiple cached channels in one go', function(done) {
        simple.mock(EventEmitter.prototype, 'close').returnWith();

        simple
        .mock(channelManager, 'createRawConsumer')
        .returnWith(new EventEmitter())
        .returnWith(new EventEmitter());

        var onEvent = simple.mock();
        channelManager.on(channelManager.CONSUMER_REMOVED_TOPIC_EVENT, onEvent);

        var channelA = channelManager.findOrCreateConsumer('crm:a');
        var channelB = channelManager.findOrCreateConsumer('crm:b');

        var singleListener = function() {};

        channelA.on('message', singleListener);
        channelA.removeListener('message', singleListener);
        channelA.on('message', singleListener); // Added listener after remove
        channelA.removeListener('message', singleListener); // Removed again
        channelA.on('message', singleListener); // Added again

        channelB.on('message', singleListener);
        channelB.removeListener('message', singleListener);

        setImmediate(function() {
          expect(EventEmitter.prototype.close.callCount).equals(1);
          expect(channelManager.createRawConsumer.callCount).equals(2);
          expect(onEvent.callCount).equals(1);
          expect(onEvent.lastCall.args[0]).equals('crm:b');

          // Cache not cleared
          channelManager.findOrCreateConsumer('crm:a');
          expect(channelManager.createRawConsumer.callCount).equals(2);

          // Cache was cleared
          channelManager.findOrCreateConsumer('crm:b');
          expect(channelManager.createRawConsumer.callCount).equals(3);

          done();
        });
      });
    });
  });
});
