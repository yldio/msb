'use strict';
var _ = require('lodash');
var channelManager = require('./channelManager');
var InfoCenterAgent = require('./infoCenterAgent');
var serviceDetails = require('./support/serviceDetails');

var channelMonitorAgent = module.exports = new InfoCenterAgent({
  announceNamespace: '_channels:announce',
  heartbeatsNamespace: '_channels:heartbeat'
});

channelMonitorAgent.doBroadcast = _.debounce(channelMonitorAgent.doBroadcast, 0);

channelMonitorAgent.on('start', function() {
  channelManager
  .on(channelManager.PRODUCER_NEW_TOPIC_EVENT, onChannelManagerProducerNewTopic)
  .on(channelManager.PRODUCER_NEW_MESSAGE_EVENT, onChannelManagerProducerNewMessage)
  .on(channelManager.CONSUMER_NEW_TOPIC_EVENT, onChannelManagerConsumerNewTopic)
  .on(channelManager.CONSUMER_REMOVED_TOPIC_EVENT, onChannelManagerConsumerRemovedTopic)
  .on(channelManager.CONSUMER_NEW_MESSAGE_EVENT, onChannelManagerConsumerNewMessage);
});

channelMonitorAgent.on('stop', function() {
  channelManager
  .removeListener(channelManager.PRODUCER_NEW_TOPIC_EVENT, onChannelManagerProducerNewTopic)
  .removeListener(channelManager.PRODUCER_NEW_MESSAGE_EVENT, onChannelManagerProducerNewMessage)
  .removeListener(channelManager.CONSUMER_NEW_TOPIC_EVENT, onChannelManagerConsumerNewTopic)
  .removeListener(channelManager.CONSUMER_REMOVED_TOPIC_EVENT, onChannelManagerConsumerRemovedTopic)
  .removeListener(channelManager.CONSUMER_NEW_MESSAGE_EVENT, onChannelManagerConsumerNewMessage);
});

function onChannelManagerProducerNewTopic(topic) {
  if (topic[0] === '_') return;
  findOrCreateChannelInfo(channelMonitorAgent.doc, topic).producers = true;
  channelMonitorAgent.doBroadcast();
}

function onChannelManagerProducerNewMessage(topic) {
  if (topic[0] === '_') return;
  var info = findOrCreateChannelInfo(channelMonitorAgent.doc, topic);
  info.lastProducedAt = new Date();
}

function onChannelManagerConsumerNewTopic(topic) {
  if (topic[0] === '_') return;
  findOrCreateChannelInfo(channelMonitorAgent.doc, topic).consumers = true;
  channelMonitorAgent.doBroadcast();
}

function onChannelManagerConsumerRemovedTopic(topic) {
  if (topic[0] === '_') return;
  findOrCreateChannelInfo(channelMonitorAgent.doc, topic).consumers = false;
}

function onChannelManagerConsumerNewMessage(topic) {
  if (topic[0] === '_') return;
  var info = findOrCreateChannelInfo(channelMonitorAgent.doc, topic);
  info.lastConsumedAt = new Date();
}

function findOrCreateChannelInfo(channelInfoPerTopic, topic) {
  var channelInfo = channelInfoPerTopic[topic];
  if (channelInfo) return channelInfo;

  channelInfo = channelInfoPerTopic[topic] = {
    producers: false,
    consumers: false,
    lastProducedAt: null,
    lastConsumedAt: null
  };
  return channelInfo;
}
