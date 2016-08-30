const dates = {
    s: 1000,
    m: 60000,
    h: 3600000,
    d: 86400000,
    M: 2592000000,
    Y: 31536000000
  };

function CachedPublish () {
  let _cached = {};

  this.__cached__ = _cached;

  function getExpTime( ms ) {
    return new Date( new Date().getTime() + ms ).getTime();
  }

  function getMS( date ) {
    const factor = dates[date[date.length - 1]] || dates.h;

    return factor * parseFloat( date );
  }

  function getMD5( query ) {
    return CryptoJS.MD5( JSON.stringify( query ) ).toString();
  }

  function storePublish ( publishName, exp, fn ) {
    const ms = getMS( exp );

    _cached[publishName] = {
        expTime: ms,
        fn: fn
      };
  }

  function resolvePublish ( publishName, args, cache ) {
    const MD5 = getMD5( args );

    let pb = _cached[publishName];

    if ( pb[MD5] && pb[MD5].response && pb[MD5].expiration > new Date().getTime() ) {
      if ( cache ) {
        return 'cache';
      }

      return pb[MD5].response;
    } else {
      args[1] = args[1] || {};
      args[1].MD5 = MD5;
      pb[MD5] = {
          expiration: getExpTime( pb.expTime ),
          response: pb.fn.apply( this, args )
        };

      pb[MD5].collection = pb[MD5].response._cursorDescription.collectionName;

      return pb[MD5].response;
    }

    this.onStop(function() {
      pb[MD5].stopped = true;
    });
  }

  function invalidateQuery ( query ) {
    const MD5 = query;

    for ( var publishName in _cached ) {
      if ( _cached.hasOwnProperty( publishName ) ) {
        let pb = _cached[publishName];
        if ( pb && pb[MD5] ) {
          pb[MD5].expiration = 0;
          pb[MD5].response = null;

          break;
        }
      }
    }
  }

  function updateItems( query, modifier, options, remove ) {
    for ( var publish in _cached ) {
      if ( _cached.hasOwnProperty( publish ) ) {
        for ( var MD5 in _cached[publish] ) {
          if ( _cached[publish].hasOwnProperty( MD5 ) ) {
            if ( MD5 !== 'expTime' && MD5 !== 'fn' ) {
              let item = _cached[publish][MD5].response.collection.findOne( query, { cpsr:true });

              if ( item ) {
                options.cpsr = true;
                if ( ! remove ) {
                  _cached[publish][MD5].response.collection.update( query, modifier, options );
                } else {
                  _cached[publish][MD5].response.collection.remove( query, options );
                }
              }
            }
          }
        }
      }
    }
  }

  Meteor.methods({
    elephantInvalidate: invalidateQuery,
    elephantUpdate: updateItems
  });

  setInterval(function() {
      for ( var publish in _cached ) {
        if ( _cached.hasOwnProperty( publish ) ) {
          for ( var MD5 in _cached[publish] ) {
            if ( _cached[publish].hasOwnProperty( MD5 ) ) {
              if ( MD5 !== 'expTime' && MD5 !== 'fn' ) {
                if ( _cached[publish][MD5].expiration < new Date().getTime() && _cached[publish][MD5].stopped ) {
                  delete _cached[publish][MD5];
                }
              }
            }
          }
        }
      }
    }, 10000 );

  function addPublish( publishName, fn, exp ) {
    let pb = {};
    storePublish( publishName, exp, fn );

    pb[publishName] = function() {
        let res = resolvePublish.bind( this )( publishName, arguments );

        return res;
      };

    function caching() {
      resolvePublish.bind( this )( publishName, arguments, true );

      return Meteor.users.find({}, { limit: 0 });
    }

    Meteor.publish( publishName, pb[publishName] );
    Meteor.publish( '_cached:' + publishName, caching );
  }

  addPublish.__cached__ = _cached;

  return addPublish;
}

Meteor.cachedPublish = new CachedPublish();
