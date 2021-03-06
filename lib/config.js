var env = process.env;
var _ = require('lodash');
var config = exports;

/**
 * Static Defaults
 */
config.serviceDetails = {};
config.schema = require('../schema');
config.cleanupConsumers = false; // Should always be false for Kafka
config.brokerAdapter = env.MSB_BROKER_ADAPTER || 'redis';

/**
 * Broker Adapter Defaults
 */
/* Redis */
config.redis = {
  host: env.MSB_BROKER_HOST || '127.0.0.1',
  port: env.MSB_BROKER_PORT || 6379,
  options: {}
};

/* AMQP */
config.amqp = {
  host: env.MSB_BROKER_HOST || '127.0.0.1',
  port: env.MSB_BROKER_PORT || 5672,
  groupId: null, // Will default to `config.serviceDetails.name`
  durable: false
};

/* Kafka */
config.kafka = {
  connectionString: (env.MSB_BROKER_HOST || '127.0.0.1') + ':' + (env.MSB_BROKER_PORT || 2181),
  consumerOptions: {
    groupId: null, // Will default to `config.serviceDetails.name`
    autoCommit: true,
    fromBeginning: false,
    fetchMaxWaitMs: 1000,
    fetchMaxBytes: 1024 * 1024
  }
};

/**
 * Override default configuration
 * @param  {Object} obj
 */
config.configure = function(obj) {
  _.merge(config, obj);
  config._afterConfigure();
};

/**
 * Initialize the configuration, values loaded dynamically on start
 * (Private, for testing)
 */
config._init = function() {
  /* Service details */
  var serviceDetails = config.serviceDetails;
  serviceDetails.hostname = require('os').hostname();
  serviceDetails.ip = require('ip').address();
  serviceDetails.pid = process.pid;

  var pkg = _mainPackage();
  serviceDetails.name = env.MSB_SERVICE_NAME || pkg && pkg.name;
  serviceDetails.version = env.MSB_SERVICE_VERSION || pkg && pkg.version;
  serviceDetails.instanceId = env.MSB_SERVICE_INSTANCE_ID || require('./support/generateId')();

  /* Override defaults from file */
  if (env.MSB_CONFIG_PATH) {
    var configPath = require('path').resolve(env.MSB_CONFIG_PATH);
    var jsonObj = require(configPath);
    delete(require.cache[configPath]);
    config.configure(jsonObj);
  } else {
    config._afterConfigure();
  }
};

config._afterConfigure = function() {
  if (config.amqp && !config.amqp.groupId) config.amqp.groupId = config.serviceDetails.name;
  if (config.kafka && !config.kafka.consumerOptions.groupId) {
    config.kafka.consumerOptions.groupId = config.serviceDetails.name;
  }
};

config._init();

/* Set any values that need to be set using the final config here */
/* e.g. `config.kafkaConsumerOptions.groupId = serviceDetails.name;` */

/**
 * Return the contents of package.json as an object
 * @return {Object}
 */
function _mainPackage() {
  var pkg;
  _.find(process.mainModule && process.mainModule.paths, function(modulesPath) {
    var pathToPackage = require('path').resolve(modulesPath, '..', 'package.json');
    try {
      pkg = require(pathToPackage);
    } catch (e) {
    }
    return pkg;
  });
  return pkg;
}
