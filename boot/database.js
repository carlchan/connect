/**
 * Dependencies
 */

var async       = require('async')
  , settings    = require('../boot/settings')
  , rclient     = require('../boot/redis')
  , Role        = require('../models/Role')
  , Scope       = require('../models/Scope')
  , issuer      = settings.issuer
  ;


/**
 * Data
 */

var defaults = {

  roles: [
    { name: 'authority' },
    { name: 'developer' }
  ],

  scopes: [
    { name: 'openid',   description: 'View your identity' },
    { name: 'profile',  description: 'View your basic account info' },
    { name: 'client',   description: 'Register and configure clients' },
    { name: 'realm',    description: 'Configure the security realm' }
  ],

  permissions: [
    ['authority', 'realm'],
    ['developer', 'client']
  ]

};


/**
 * Insert Roles
 */

function insertRoles (done) {
  async.map(defaults.roles, function (role, callback) {
    Role.insert(role, function (err, instance) {
      callback(err, instance);
    })
  }, function (err, roles) {
    console.log('Created default roles.');
    done(err, roles);
  });
}


/**
 * Insert Scopes
 */

function insertScopes (done) {
  async.map(defaults.scopes, function (scope, callback) {
    Scope.insert(scope, function (err, instance) {
      callback(err, instance);
    })
  }, function (err, scopes) {
    console.log('Created default scopes.');
    done(err, scopes);
  });
}


/**
 * Assign Permissions
 */

function assignPermissions (done) {
  async.map(defaults.permissions, function (pair, callback) {
    Role.addScopes(pair[0], pair[1], function (err, result) {
      callback(err, result);
    });
  }, function (err, results) {
    console.log('Created default permissions.');
    done(err, results);
  })
}


/**
 * Tag Version
 */

function version (done) {
  rclient.set('anvil:connect:version', settings.version, function (err) {
    done(err);
  });
}


/**
 * Exports
 */

module.exports = function setup () {
  var multi = rclient.multi();

  multi.get('version');
  multi.get('anvil:connect:version');
  multi.dbsize();

  multi.exec(function (err, results) {
    if (err) {
      console.log(Array.isArray(err) ? err[0].message : err.message);
      process.exit(1);
    }

    var deprecatedVersion = results[0];
    var version = results[1] || results[0];
    var dbsize = results[2];

    if (!version && dbsize > 0) {
      if (process.argv.indexOf('--no-db-check') === -1) {
        console.log(
          '\nRedis already contains data, but it doesn\'t seem to be an ' +
          'Anvil Connect database.\nIf you are SURE it is, start the server ' +
          'with --no-db-check to skip this check.\n'
        );
        process.exit(1);
      }
    }

    if ((deprecatedVersion && !results[1]) || version !== settings.version) {
      rclient.set('anvil:connect:version', settings.version, initialize);
    } else {
      initialize(null);
    }

    function initialize(err) {
      if (err) {
        console.log(err.message);
        process.exit(1);
      }

      if (!version && dbsize === 0) {
        async.parallel([
          insertRoles,
          insertScopes,
          assignPermissions,
          version
        ], function (err, results) {
          if (err) {
            console.log('Unable to set defaults in Redis.');
            console.log(err.message);
            process.exit(1);
          }
        });
      }
    }
  });
}
