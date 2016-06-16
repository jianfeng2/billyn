/**
 * Using Rails-like standard naming convention for endpoints.
 * GET     /api/apps              ->  index
 * POST    /api/apps              ->  create
 * GET     /api/apps/:id          ->  show
 * PUT     /api/apps/:id          ->  update
 * DELETE  /api/apps/:id          ->  destroy
 */

'use strict';

import _ from 'lodash';
import {Circle} from '../../sqldb';
import {Collab} from '../../sqldb';
import {CircleCollab} from '../../sqldb';
import {CircleSpace} from '../../sqldb';
import {Space} from '../../sqldb';
import {Category} from '../../sqldb';
import {CollabRole} from '../../sqldb';
import {PermitRole} from '../../sqldb';
import {Permit} from '../../sqldb';
import {Nut} from '../../sqldb';
import {Role} from '../../sqldb';
import {UserRole} from '../../sqldb';
var Promise = require('bluebird');

function respondWithResult(res, statusCode) {
  statusCode = statusCode || 200;
  return function (entity) {
    if (entity) {
      res.status(statusCode).json(entity);
    }
  };
}

function saveUpdates(updates) {
  return function (entity) {
    return entity.updateAttributes(updates)
      .then(updated => {
        return updated;
      });
  };
}

function removeEntity(res) {
  return function (entity) {
    if (entity) {
      return entity.destroy()
        .then(() => {
          res.status(204).end();
        });
    }
  };
}

function handleEntityNotFound(res) {
  return function (entity) {
    if (!entity) {
      res.status(404).end();
      return null;
    }
    return entity;
  };
}

function handleError(res, statusCode) {
  statusCode = statusCode || 500;
  return function (err) {
    res.status(statusCode).send(err);
  };
}

// Gets a list of Circles
export function index(req, res) {

  Circle.belongsTo(Category, { as: 'type' });
  Circle.belongsTo(Space, { as: 'space' });
  Circle.belongsToMany(Collab, { through: 'CircleCollab', foreignKey: 'circleId', otherKey: 'collabId', as: 'collabs' });
  Collab.belongsTo(Category, { as: 'type' });
  //Collab.hasMany(CollabRole, { foreignKey: 'collabId', as: 'collabRoles' });
  //CircleCollab.belongsTo(Collab, { as: 'collab' });
  //that.hasMany(CollabRole,{foreignKey: 'collabId', as:'childRoles'});
  //CollabRole.belongsTo(Role, { as: 'role' });
  //Collab.belongsToMany(CollabRole,{as: 'collabRoles'});
  Collab.belongsToMany(Role, { through: 'CollabRole', foreignKey: 'collabId', otherKey: 'roleId', as: 'parentRoles' });
  Collab.belongsToMany(Role, { through: 'CollabRole', foreignKey: 'collabId', otherKey: 'roleId', as: 'childRoles' });
  Role.hasMany(PermitRole, { as: 'nutPermits' });
  PermitRole.belongsTo(Nut, { foreignKey: 'ownerId', as: 'nut' });
  PermitRole.belongsTo(Permit, { as: 'permit' });

  var typeInclude = {
    model: Category, as: 'type'
  }

  var spaceInclude = {
    model: Space, as: 'space'
  }

  /*
  var collabInclude = {
    model: Collab, as: 'collabs',
    include: {
      model: Collab, as: 'collab',
      include: [
        {
          model: Category, as: 'type'
        },
        {
          model: CollabRole, as: 'collabRoles',
          include: [
            {
              model: Role, as: 'role'
            }
          ]
        }
      ]
    }
  }
  */
  var collabInclude = {
    model: Collab, as: 'collabs',
    include: [
      {
        model: Role, as: 'parentRoles',
        through: {
          where: {
            roleType: 'parent'
          }
        },
        include: [
          {
            model: PermitRole, as: 'nutPermits',
            include: [
              {
                model: Nut, as: 'nut'
              },
              {
                model: Permit, as: 'permit'
              }
            ]
          }
        ]
      },
      {
        model: Role, as: 'childRoles',
        through: {
          where: {
            roleType: 'child'
          }
        }
      }
    ]
  }

  //console.log('collabInclude:', collabInclude);

  //if provide type as name, find like types circles
  if (req.query.type) {
    typeInclude.where = {
      fullname: {
        $like: "%" + req.query.type + "%"
      }
    };
    delete req.query.type;
  }

  if (req.query.typeName) {
    typeInclude.where = {
      $like: {
        name: req.query.typeName
      }
    }
  }

  Circle.findAll({
    where: req.query,
    include: [typeInclude, spaceInclude, collabInclude]
  })
    .then(respondWithResult(res))
    .catch(handleError(res));
}

// Gets a list of user circles as guest
// must provide userId and spaceId
// will return circles with collab
/*
  format for response:
  [{
    name: circleName,
    ...
    collabs: [
      {
        name: collabName
        ...
        nutPermitRoles: [
          {
            permit: {},
            nut: {}
          }
        ]
      }
    ]

  }]
*/
export function findUserCircles(req, res) {
  var userId = req.query.userId;
  var spaceId = req.query.spaceId;

  Circle.belongsTo(Category, { as: 'type' });
  Collab.belongsTo(Category, { as: 'type' });
  Circle.hasMany(CircleCollab, { foreignKey: 'circleId', as: 'circleCollabs' });
  CollabRole.belongsTo(Collab, { as: 'collab' });
  CollabRole.belongsTo(Role, { as: 'role' });
  Role.hasMany(PermitRole, { foreignKey: 'roleId', as: 'PermitNuts' });
  PermitRole.belongsTo(Permit, { as: 'permit' });
  PermitRole.belongsTo(Role, { as: 'role' });
  PermitRole.belongsTo(Nut, { foreignKey: 'ownerId', as: 'nut' });

  var guestRoleList;
  var collabIdList;
  var collabRoleList;
  var circleList;

  UserRole.findAll({
    where: {
      userId: userId,
      spaceId: spaceId
    }
  }).then(function (userRoles) {
    //console.log('userRoles', JSON.stringify(userRoles));
    var roleIdList = [];
    userRoles.forEach(function (userRole) {
      //console.log('userRole',JSON.stringify(userRole));
      if (roleIdList.indexOf(userRole.roleId) === -1) {
        roleIdList.push(userRole.roleId);
      }
      //console.log('2');
    });
    //console.log('roleIdList', JSON.stringify(roleIdList));
    Collab.belongsToMany(Role, { through: 'CollabRole', foreignKey: 'collabId', otherKey: 'roleId' });
    //console.log(1);
    return Collab.findAll(
      {//first get collabs as childRole
        include: [
          {
            model: Role,
            where: {
              $or: {
                _id: roleIdList
              }
            },
            through: {
              where: {
                roleType: 'child'
              }
            }
          }
        ]
      }).then(function (collabs) {
        console.log('collabs:', JSON.stringify(collabs));
        var collabIdList = [];
        collabs.forEach(function (o) {
          collabIdList.push(o._id);
        })
        Role.belongsToMany(Collab, { through: 'CollabRole', foreignKey: 'roleId', otherKey: 'collabId' });
        Role.hasMany(PermitRole, { foreignKey: 'roleId', as: 'nutPermits' });
        PermitRole.belongsTo(Permit, { as: 'permit' });
        PermitRole.belongsTo(Role, { as: 'role' });
        PermitRole.belongsTo(Nut, { foreignKey: 'ownerId', as: 'nut' });
        //find parent roles through collabs
        return Role.findAll({
          include: [
            {
              model: Collab,
              include: [
                {
                  model: Role,
                }
              ],
              where: {
                $or: {
                  _id: collabIdList
                }
              },
              through: {
                where: {
                  roleType: 'parent'
                }
              }
            },
            {
              model: PermitRole, as: 'nutPermits',
              include: [
                {
                  model: Permit, as: 'permit'
                },
                {
                  model: Nut, as: 'nut'
                }
              ]
            }
          ]
        })
      }).then(function (parentRoles) {
        var circles = {};
        parentRoles.forEach(function (role) {
          var collabs = role.collabs;
          collabs.forEach(function (collab) {
            var circle = collab.circle;
            circles[circle._id] = circle;
            if (!circle.collabs) {
              circle.collabs = {};
            }
            circle.collabs[collab._id] = collab;
            if (!collab.parentRoles) {
              collab.parentRoles = {};
            }
            collab.parentRoles[role._id] = role;
            if (!collab.nutPermits) {
              collab.nutPermits = {};
            }
            role.nutPermits.forEach(function (o) {
              collab.nutPermits[o._id] = o;
            })
          })
        });
        return Promise.resolve(circles);
      });
  })
    .then(respondWithResult(res))
    .catch(handleError(res));
}

//must provide userId, spaceId, circleId
export function findUserCircleNuts(req, res) {

  var userId = req.query.userId;
  var circleId = req.query.circleId;
  var spaceId = req.query.spaceId;

}

export function findCirclesForJoin(req, res) {

  if (!req.query.spaceId) {
    res.status(500).send('please provide spaceId!');
  }

  var theCircles;

  /**
   * first find circles not belong to spaceId
   * then find circles not contain collabs joined by spaceId
   * to find collabs not joined by spaceId, should find 
   * collab child role not belong to spaceId
   */
  Circle.belongsToMany(Collab, { through: 'CircleCollab', as: 'collabs' });
  Collab.hasMany(CollabRole, { as: 'collabRoles' });
  CollabRole.belongsTo(Role, { as: 'role' });

  Circle.findAll({
    where: {
      spaceId: {
        $ne: req.query.spaceId
      }
    },
    include: [
      {
        model: Collab, as: 'collabs',
        include: [
          {
            model: CollabRole, as: 'collabRoles',
            include: [
              {
                model: Role, as: 'role',
                where: {
                  spaceId: {
                    $ne: req.query.spaceId
                  }
                }
              }
            ]
          }
        ]
      }
    ]
  })
    .then(respondWithResult(res))
    .catch(handleError(res));
}

// Gets a single Nut from the DB
export function show(req, res) {
  Circle.belongsTo(Category, { as: 'type' });
  Circle.belongsTo(Space, { as: 'space' });
  Circle.hasMany(CircleCollab, { foreignKey: 'circleId', as: 'circleCollabs' });
  Collab.belongsTo(Category, { as: 'type' });
  Collab.hasMany(CollabRole, { foreignKey: 'collabId', as: 'collabRoles' });
  CircleCollab.belongsTo(Collab, { as: 'collab' });
  //that.hasMany(CollabRole,{foreignKey: 'collabId', as:'childRoles'});
  CollabRole.belongsTo(Role, { as: 'role' });
  Circle.find({
    where: { _id: req.params.id },
    include: [
      {
        model: Category, as: 'type'
      }, {
        model: Space, as: 'space'
      },
      {
        model: CircleCollab, as: 'circleCollabs',
        include: {
          model: Collab, as: 'collab',
          include: [
            {
              model: Category, as: 'type'
            },
            {
              model: CollabRole, as: 'collabRoles',
              include: [
                {
                  model: Role, as: 'role'
                }
              ]
            }
          ]
        }
      }
    ]
  })
    .then(handleEntityNotFound(res))
    .then(respondWithResult(res))
    .catch(handleError(res));
}

// Creates a new Circle in the DB
/**
 * post data: {
 * name:xxs
 * alias: xxx,
 * spaceId: xxx
 * type: xxxx [typeId:xxx] 
 * }
 * if provide type, will create type by default
 */
export function create(req, res) {

  Circle.belongsTo(Category, { as: 'type' });
  Circle.belongsTo(Space, { as: 'space' });
  var circleData = req.body;
  var typeData, spaceId, typeId;
  var theCircle, defaultCollabs;
  //console.log('circleData:', JSON.stringify(circleData));
  if (circleData.type && circleData.type.defaultCollabs) {
    defaultCollabs = circleData.type.defaultCollabs;
  }
  for (var key in circleData) {
    if (key.toLowerCase() === 'type' || key.toLowerCase() === 'typename') {
      typeData = circleData[key];
      delete circleData[key];
    }
    if (key.toLowerCase() === 'spaceid') {
      spaceId = circleData[key];
    }
    if (key.toLowerCase() === 'typeid') {
      typeId = circleData[key];
    }
  }

  if (circleData.name) {
    var circleName = circleData.name;
  		// delete circleData.name;
  }

  if (!typeId && !typeData) {
    typeData = {
      name: "normal",
      alias: "normal circle"
    };
  }

  //console.log('spaceId',spaceId);
  //console.log('circleName',circleName);

  if (!spaceId || !circleName) {
    return res.status(500).send('please check input!');
  }

  if (typeData && circleName) {
    //console.log('create circle typeName:',typeName);
    Circle.addType(typeData).then(function (type) {
      //console.log('type:',JSON.stringify(type));
      circleData.typeId = type._id;
      var whereData = {
        name: circleName,
        spaceId: spaceId
      }
      Circle.findOrCreate({
        where: whereData,
        defaults: circleData
      })
        .spread(function (circle, created) {
          //console.log('circle:',JSON.stringify(circle));
          theCircle = circle;
          //console.log('circleData 2:',JSON.stringify(circleData));
          //console.log('defaultCollabs:',JSON.stringify(defaultCollabs));
          if (defaultCollabs) {
            //var defaultCollabs = circleData.defaultCollabs;
            //console.log('defaultCollabs:',JSON.stringify(defaultCollabs));
            return Collab.bulkAdd(defaultCollabs, { spaceId: spaceId }).then(function (collabs) {
              //console.log('collbs:', JSON.stringify(collabs));
              return Promise.each(collabs, function (collab) {
                return CircleCollab.findOrCreate({
                  where: {
                    circleId: circle._id,
                    collabId: collab._id
                  },
                  defaults: {}
                });
              });
            });
          } else {
            return Promise.resolve(null);
          }
        }).then(function () {
          //console.log('after add collabs to circle');
          Circle.belongsTo(Category, { as: 'type' });
          Circle.belongsTo(Space, { as: 'space' });
          Circle.hasMany(CircleCollab, { foreignKey: 'circleId', as: 'circleCollabs' });
          Collab.belongsTo(Category, { as: 'type' });
          Collab.hasMany(CollabRole, { foreignKey: 'collabId', as: 'collabRoles' });
          CircleCollab.belongsTo(Collab, { as: 'collab' });
          //that.hasMany(CollabRole,{foreignKey: 'collabId', as:'childRoles'});
          CollabRole.belongsTo(Role, { as: 'role' })
          //console.log('circle:', JSON.stringify(theCircle));
          Circle.find({
            where: { _id: theCircle._id },
            include: [
              {
                model: Category, as: 'type'
              }, {
                model: Space, as: 'space'
              },
              {
                model: CircleCollab, as: 'circleCollabs',
                include: {
                  model: Collab, as: 'collab',
                  include: [
                    {
                      model: Category, as: 'type'
                    },
                    {
                      model: CollabRole, as: 'collabRoles',
                      include: [
                        {
                          model: Role, as: 'role'
                        }
                      ]
                    }
                  ]
                }
              }
            ]
          })
            .then(handleEntityNotFound(res))
            .then(respondWithResult(res))
            .catch(handleError(res));
        })
    });
  } else {
    //console.log('not type:', JSON.stringify(circleData));
    var whereData = {
      name: circleName,
      spaceId: spaceId
    }
    Circle.findOrCreate({
      where: whereData,
      defaults: circleData
    })
      .spread(function (circle, created) {
        //console.log('2 not type:', JSON.stringify(circle));
        return Circle.find({
          where: { _id: circle._id },
          include: [{
            model: Category, as: 'type'
          },
            {
              model: Space, as: 'space'
            }
          ]
        })
      })
      .then(respondWithResult(res, 201))
      .catch(handleError(res));
  }
}

// Updates an existing Circle in the DB
export function update(req, res) {
  if (req.body._id) {
    delete req.body._id;
  }
  Circle.find({
    where: {
      _id: req.params.id
    }
  })
    .then(handleEntityNotFound(res))
    .then(saveUpdates(req.body))
    .then(respondWithResult(res))
    .catch(handleError(res));
}

// Deletes a Circle from the DB
export function destroy(req, res) {
  Circle.find({
    where: {
      _id: req.params.id
    }
  })
    .then(handleEntityNotFound(res))
    .then(removeEntity(res))
    .catch(handleError(res));
}

export function addType(req, res) {

  Circle.addType(req.body)
    .then(respondWithResult(res, 201))
    .catch(handleError(res));

}

/**
 * req.body format: 
 * {
 *  roleId: xxx,
 *  circleId: xxx
 * }
 * this function will add role into circleMember collab in circle
 */
export function joinCircle(req, res) {
  
  if(!req.body.spaceId){
    res.status(500).send('please provide spaceId');
  }
  
  if(!req.body.circleId){
    res.status(500).send('please provide circleId');
  }
  
  CircleCollab.belongsTo(Circle, {as: 'circle'});
  CircleCollab.belongsTo(Collab,{as: 'collab'});

  CircleCollab.find({
    include: [
      {
        model: Circle, as: 'circle',
        where: {
          _id: req.body.circleId
        }
      },
      {
        model: Collab, as: 'collab',
        where: {
          name: 'circleMember'
        }
      }
    ]
  }).then(function (circleCollab) {
    var collab = circleCollab.collab;
    //add default client manger role for joining space
    var roleData = {
      name: 'member.circle.client.manager',
      spaceId: req.body.spaceId
    };
    return Role.add(roleData).then(function(role){
        return collab.addRole({
        childRoleId: role._id,
        collabId: collab._id
      }).then(function () {
        return Collab.findById(collab._id);
      });
    });    
  })
    .then(respondWithResult(res, 201))
    .catch(handleError(res));
}