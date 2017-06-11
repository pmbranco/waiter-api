var express = require('express');
var router = express.Router();
var bodyParser = require('body-parser');
var mongoose = require('mongoose');
var methodOverride = require('method-override');
var config = require('config');
var jwt = require('jsonwebtoken');
var jsend = require('jsend');

var User = require('./../models/User');
var Event = require('./../models/Event');

var httpCodes = config.get('httpCodes');
var zoomDistanceRatio = config.get('zoomDistanceRatio');
var tokenConfig = config.get('JWT');

const tokenSecret = tokenConfig.tokenSecret;

//@TODO remove callback hell !!!
//@TODO implement promise or wait !!!
//@TODO create named callback functions !!!

router.use(methodOverride(function(req, res) {
    if (req.body && typeof req.body === 'object' && '_method' in req.body) {
        var method = req.body._method;
        delete req.body._method;
        return method;
    }
}));

router.use(jsend.middleware);
router.use(bodyParser.json());
router.use(bodyParser.urlencoded({
    extended: true
}));

// Start: Middleware (1)
/**
 * Middleware verify event exists
 */
router.param('id', function(req, res, next, id) {
    var causes = [];

    Event.findById(id, function (err, event) {
        if (err) {
            res.status(httpCodes.internalServerError).jsend.error({message: err.message});
            return ;
        }
        if (event === null) {
            causes.push('Event not found');
            res.status(httpCodes.notFound).jsend.fail({message: 'Event middleware failed', causes: causes});
            return ;
        }
        next();


        /* if (err) {
         *     console.log(id + ' was not found');
         *     res.status(404)
         *     var err = new Error('Not Found');
         *     err.status = 404;
         *     res.format({
         *         json: function(){
         *             res.status(404).json({status: "fail", data : { message: err.status  + ' ' + err}});
         res.status(httpCodes.notFound).jsend.fail({message: '', causes: causes});
         *         }
         *     });
         * } else {
         *     req.id = id;
         *     next();
         * }*/
    });
});
// End: Middleware (2)

/**
 * Route Create Event
 */
router.post('/create', function(req, res) {
    var causes = [];

    var event = {
        name: res.req.body.name,
        description: res.req.body.description,
        address: res.req.body.address,
        location: [res.req.body.long, res.req.body.lat],
        date: res.req.body.date
    };

    Event.create(event, function(err, createdEvent) {
        if (err) {
            if (err.errors) {
                if (err.errors.name)
                    causes.push(err.errors.name.message);
                if (err.errors.description)
                    causes.push(err.errors.description.message);
                if (err.errors.location)
                    causes.push(err.errors.location.message);
                if (err.errors.date)
                    causes.push(err.errors.date.message)
            }
            res.status(httpCodes.badRequest).jsend.fail({message: 'Create event failed', causes: causes});
            return ;
        }

        var response = {
            event: createdEvent
        };
        res.status(httpCodes.created).jsend.success(response);
    });
});

/**
 * Route Get One Event By ID
 */
router.get('/:id', function(req, res) {
    var causes = [];

    Event.findById(req.params.id, function (err, event) {
        if (err) {
            res.status(httpCodes.internalServerError).jsend.error({message: err.message});
            return ;
        }
        if (event === null) {
            causes.push('Event not found');
            res.status(httpCodes.notFound).jsend.fail({message: 'Get event failed', causes: causes});
            return ;
        }
        res.jsend.success({event: event});
    }).select('-__v');
});

/**
 * Route Get Event Near a Location
 */
router.get('/long/:long/lat/:lat/zoom/:zoom', function(req, res) {
    var causes = [];

    var long = parseFloat(req.params.long);
    var lat = parseFloat(req.params.lat);
    var zoom = parseInt(req.params.zoom);

    if (!long)
        causes.push('A long is required');
    if (!lat)
        causes.push('A lat is required');
    if (!zoom)
        causes.push('A zoom is required');
    if (causes.length > 0) {
        res.status(httpCodes.badRequest).jsend.fail({message: 'Get Event Near Location failed', causes: causes});
        return ;
    }

    Event.find({}, function (err, events) {
        if (err) {
            res.status(httpCodes.internalServerError).jsend.error({message: err.message});
            return ;
        }
        res.jsend.success({events: events});
    }).where('location')
        .near({ center: {type: 'Point', coordinates: [long, lat]}, maxDistance: zoomDistanceRatio[zoom - 1], spherical: true})
        .select('-__v');
});

/**
 * Route Get All Events
 */
router.get('/', function(req, res) {
    Event.find({}, function (err, events) {
        if (err) {
            res.status(httpCodes.internalServerError).jsend.error({message: err.message});
            return ;
        }
        res.jsend.success({events: events});
    }).select('-__v');
});

/**
 * Route Delete Event
 */
router.delete('/:id/delete', function(req, res) {
    var causes = [];

    Event.findById(req.params.id, function (err, event) {
        if (err) {
            res.status(httpCodes.badRequest).jsend.error({message: err.message});
            return ;
        }
        if (event === null) {
            causes.push('Event not found');
            res.status(httpCodes.notFound).jsend.fail({message: 'Delete event failed', causes: causes});
            return ;
        }

        event.remove(function (err) {
            if (err) {
                res.status(httpCodes.badRequest).jsend.error({message: err.message});
                return ;
            }
            res.jsend.success({message: 'Event successfully deleted'});
        });
    });
});

// Start: Middleware (2)
/**
 * Middleware verify token
 */
router.use(function(req, res, next) {
    var token = req.body.token || req.query.token || req.headers['x-access-token'];
    if (!token) {
        res.status(httpCodes.badRequest).jsend.fail({message: 'No token provided.'});
        return ;
    }
    jwt.verify(token, tokenSecret, function(err, decoded) {
        if (err) {
            res.status(httpCodes.unauthorized).jsend.fail({message: 'Failed to authenticate token'});
            return ;
        }
        req.decoded = decoded;
        next();
    });
});
// End: Middleware (2)

/**
 * Route Waiter Join Event
 */
router.put('/:eventId/join/:waiterId', function(req, res) {
    var causes = [];

    User.findById(req.params.waiterId, function (err, user) {
        if (err) {
            res.status(httpCodes.badRequest).jsend.error({message: err.message});
            return ;
        }
        if (user === null) {
            causes.push('User not found');
            res.status(httpCodes.notFound).jsend.fail({message: 'Join event failed', causes: causes});
            return ;
        }
        Event.findById(req.params.eventId, function (err, event) {
            if (err) {
                res.status(httpCodes.badRequest).jsend.error({message: err.message});
                return ;
            }

            if (event === null) {
                causes.push('Event not found');
                res.status(httpCodes.notFound).jsend.fail({message: 'Join event failed', causes: causes});
                return ;
            }
            if (user.waiterCurrentEvent !== null) {
                causes.push('Waiter has already joined an event');
                res.status(httpCodes.conflict).jsend.fail({message: 'Join event failed', causes: causes});
                return ;
            }


            user.update({waiterCurrentEvent: event._id }, function (err) {
                if (err) {
                    res.status(httpCodes.badRequest).jsend.error({message: err.message});
                    return ;
                }
                event.listOfWaiters.push(user._id);
                event.save(function (err) {
                    if (err) {
                        res.status(httpCodes.badRequest).jsend.error({message: err.message});
                        return ;
                    }
                    res.jsend.success({message: 'Waiter has successfully joined the event'});
                });
            });
        });
    });
});

/**
 * Route Waiter Leave Event
 */
router.put('/:eventId/leave/:waiterId', function(req, res) {
    var causes = [];

    User.findById(req.params.waiterId, function (err, user) {
        if (err) {
            res.status(httpCodes.badRequest).jsend.error({message: err.message});
            return ;
        }
        if (user === null) {
            causes.push('User not found');
            res.status(httpCodes.notFound).jsend.fail({message: 'Leave event failed', causes: causes});
            return ;
        }
        Event.findById(req.params.eventId, function (err, event) {
            if (err) {
                res.status(httpCodes.badRequest).jsend.error({message: err.message});
                return ;
            }

            if (event === null) {
                causes.push('Event not found');
                res.status(httpCodes.notFound).jsend.fail({message: 'Leave event failed', causes: causes});
                return ;
            }

            if (!user.waiterCurrentEvent) {
                causes.push("Waiter hasn't joined any events");
                res.status(httpCodes.conflict).jsend.fail({message: 'Leave event failed', causes: causes});
                return ;
            }

            if (user.waiterCurrentEvent !== req.params.eventId) {
                causes.push("Waiter hasn't joined this event");
                res.status(httpCodes.conflict).jsend.fail({message: 'Leave event failed', causes: causes});
                return ;
            }

            user.update({
                waiterCurrentEvent: null
            }, function (err) {
                if (err) {
                    res.status(httpCodes.badRequest).jsend.error({message: err.message});
                    return ;
                }
                event.listOfWaiters.remove(user._id);
                event.save(function (err) {
                    if (err) {
                        res.status(httpCodes.badRequest).jsend.error({message: err.message});
                        return ;
                    }
                    res.jsend.success({message: 'Waiter has successfully left the event'});
                });
            });
        });
    });
});

module.exports = router;
