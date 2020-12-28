const express = require("express");
const app = express();
const assert = require("assert");
const fs = require("fs");
const session = require("express-session");
const {v4: uuid} = require('uuid');
const formidableMiddleware = require("express-formidable");
const MongoClient = require("mongodb").MongoClient;
const ObjectID = require("mongodb").ObjectID;
const SECRETKEY = "PASS";
const MongoURL = '';

const RESTAURANT = "rest"

var users = new Array(
    {userid: "demo", password: ""},
    {userid: "student", password: ""}
)

MongoClient.connect(MongoURL, {useNewUrlParser: true, useUnifiedTopology: true}, function (err, client) {
    if (err) throw err
    var db = client.db('test');
    app.set("view engine", "ejs")
    app.use(formidableMiddleware())

    app.use(session({
        resave: true,
        saveUninitialized: true,
        secret: SECRETKEY,
        genid: req => uuid() 
    }))


    app.get("/login", (req, res) => {
        if (!req.session.authenticated) {
            res.status(200).render("login")
        } else {
            res.redirect("/list")
        }
    })

    app.post("/login", (req, res) => {
        for (var i = 0; i < users.length; i++) {
            if (users[i].userid === req.fields.userid &&
                users[i].password === req.fields.password) {
                req.session.authenticated = true
                req.session.userid = users[i].userid
            }
        }
        res.redirect("/list")
    })

    app.use((req, res, next) => { 
        console.log("Running login")
        if (req.session.authenticated) {
            next()
        } else {
            res.redirect("/login")
        }
    })

    app.get("/logout", (req, res) => {
        req.session.authenticated = false
        req.session.userid = null
        res.redirect("/login")
    })

    app.get("/list", (req, res) => {
        var query = req.query
        findRestaurant(db, {}, (restaurant) => {
            res.render("list", {restaurant, self: req.session.userid, query})
        })
    })

    app.get("/display", (req, res) => {
        var criteria = {_id: ObjectID(req.query._id)}
        findRestaurant(db, criteria, (record) => {
            if (record[0] != undefined) {
                res.render("display", {record: record[0]})
            } else {
                res.render("error", {message: "restaurant not found"})
            }
        })
    })

    app.get("/create", (req, res) => {
        res.render("create")
    })

    app.post("/create", async (req, res) => {

        var name = req.fields.name;
        var borough = req.fields.borough;
        var cuisine = req.fields.cuisine;
        var street = req.fields.street;
        var building = req.fields.building;
        var zipcode = req.fields.zipcode;
        var axisx = req.fields.axisx;
        var axisy = req.fields.axisy;
        var uploadPhoto = req.files.photo;
        var owner = req.session.userid;
        var filename = uploadPhoto.path;
        var mimetype = uploadPhoto.type;
        var photo;
        assert.notEqual(owner, null)
        assert.notEqual(name, null)

        

        if (uploadPhoto.size !== 0 && (mimetype === "image/jpeg" || mimetype === "image/png")) {
            await new Promise((resolve, reject) => {
                fs.readFile(filename, (err, data) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(photo = {
                                mimetype, image: new Buffer(data).toString("base64")
                            }
                        )
                    }
                })
            })
        }
        insertRestaurant(db, name, borough, cuisine, photo, street, building, zipcode, axisx, axisy, owner, function (result) {
            assert.equal(err, null)
            if (!result) {
                res.render("create", {error: "some error occurs"})
            }
            res.redirect("/list")
        })

    })

    app.get("/score", (req, res) => {
        var {_id} = req.query
        if (_id == null) {
            res.render("error", {message: "invalid arguments"})
            return
        }
        findRestaurant(db, {_id: ObjectID(_id)}, (record) => {
            if (record[0] !== undefined) {
                if (record[0].score != null) {
                    if (record[0].score.filter(record => {
                        return record.userid === req.session.userid
                    }).length === 0) {
                        res.render("score", {_id, userid: req.session.userid})
                    } else {
                        res.render("error", {message: "You have scored already"})
                    }
                } else {
                    res.render("score", {_id, userid: req.session.userid})
                }
            } else {
                console.log(record[0])
                res.render("error", {message: "restaurant do not exist"})
            }
        })
    })

    app.post("/score", (req, res) => {
        var _id = req.fields._id;
        var score = req.fields.score;
        var userid = req.fields.userid;
        rateRestaurant(db, _id, score, userid, function (result) {

        });
        res.redirect("/list")
    })

    app.get('/delete', function (req, res) {

        var criteria = {};
        var save = req.query._id;
        criteria['_id'] = ObjectID(save);
        console.log(criteria);
        deleteRestaurant(db, criteria, function (result) {

        });
        res.redirect('/');
        return
    })

    app.get("/change", (req, res) => {  
        var self = req.session.userid;
        var criteria = {_id: ObjectID(req.query._id), owner: self};
        findRestaurant(db, criteria, (record) => {
            if (record[0] !== undefined) {
                res.render("change", {record: record[0], error: null})
            } else {
                res.render("error", {message: "Rejected: You are not authorized to edit"})
            }
        })
    })

    app.post("/change", async (req, res) => {

        var name = req.fields.name;
        var borough = req.fields.borough;
        var cuisine = req.fields.cuisine;
        var street = req.fields.street;
        var building = req.fields.building;
        var zipcode = req.fields.zipcode;
        var axisx = req.fields.axisx;
        var axisy = req.fields.axisy;
        var _id = req.fields._id;
        var uploadPhoto = req.files.photo;
        var self = req.session.userid;
        var filename = uploadPhoto.path;
        var mimetype = uploadPhoto.type;
        var photo;
        if (name == null) {
            res.render("error", {message: "name should not be empty"})
            return
        }

        var newRecord = {name, borough, cuisine, address: {street, building, zipcode, coord: {axisx, axisy}}}

        


        if (uploadPhoto.size !== 0 && (mimetype === "image/jpeg" || mimetype === "image/png")) {
            await new Promise((resolve, reject) => {
                fs.readFile(filename, (err, data) => {
                    if (err) {
                        reject(err)
                    } else {
                        resolve(
                            photo = {
                                mimetype,
                                image: new Buffer(data).toString("base64")
                            }
                        )
                    }
                })
            })
            newRecord.photo = photo
        }
        updateRestaurant(db, _id, self, newRecord, function (result) {
            assert.equal(err, null)
            if (!result) {
                res.render("change", {error: "some error occurs", record: {name: "some error occurs"}})
            } else {
                res.redirect("/list")
            }
        })

    })



    app.get("/api/restaurant/", (req, res) => {
        findRestaurant(db, {}, (restaurant) => {
            res.status(200).json(restaurant)
        })
    })

    app.post("/api/restaurant/", async (req, res) => {

        var name = req.fields.name;
        var borough = req.fields.borough;
        var cuisine = req.fields.cuisine;
        var street = req.fields.street;
        var building = req.fields.building;
        var zipcode = req.fields.zipcode;
        var axisx = req.fields.axisx;
        var axisy = req.fields.axisy;
        var user = req.fields.field;
        var filename = uploadPhoto.path;
        var mimetype = uploadPhoto.type;
        var photo;
        var uploadPhoto = req.files.photo
        if (name == null) {
            res.status(200).json({status: "failed"})
            return
        }
    
        if (uploadPhoto != null) {
 
            if (uploadPhoto.size !== 0 && (mimetype === "image/jpeg" || mimetype === "image/png")) {
                await new Promise((resolve, reject) => {
                    fs.readFile(filename, (err, data) => {
                        if (err) { reject(err)} else {
                            resolve(
                                photo = {mimetype,image: new Buffer(data).toString("base64")
                                }
                            )
                        }
                    })
                })
            }
        }

        insertRestaurant(db, name, borough, photo, street, building, zipcode, axisx, axisy, owner, function (err, insertOneWriteOpResult) {
            assert.equal(err, null)
            if (!insertOneWriteOpResult) {
                res.status(200).json({status: "failed"})
            }
            res.status(200).json({status: "ok", _id: insertOneWriteOpResult.insertedId})
        })

    })


    app.get("/api/restaurant/name/:name", (req, res) => {
        var criteria = {}
        criteria['name'] = req.params.name;
        findRestaurant(db, criteria, (restaurant) => {
            res.status(200).json(restaurant)
        })
    })

    app.get("/api/restaurant/borough/:borough", (req, res) => {
        var criteria = {}
        criteria['borough'] = req.params.borough;
        findRestaurant(db, criteria, (restaurant) => {
            res.status(200).json(restaurant)
        })
    })


    app.get("/api/restaurant/cuisine/:cuisine", (req, res) => {
        var criteria = {}
        criteria['cuisine'] = req.params.cuisine;
        findRestaurant(db, criteria, (restaurant) => {
            res.status(200).json(restaurant)
        })
    })

    app.get("/googlemap", (req, res) => {
        var lat = req.query.lat;
        var lon = req.query.lon;
        var restaurant = req.query.restaurant;
        if (lat != null && lon != null && restaurant != null) {
            res.render("googlemap", {lat, lon, restaurant})
        } else {
            res.render("error", {message: "invalid arguments"})
        }
    })

    app.get("*", (req, res) => {
        res.redirect("/list")
    })

    app.listen(process.env.PORT || 8099)
    console.log("server started!")
})


function findRestaurant(db, criteria, callback) {
    var rests = [];
    var rest = db.collection(RESTAURANT).find(criteria);
    rest.each(function (err, doc) {
        assert.equal(err, null)
        if (doc != null) {
            rests.push(doc);
        } else {
            callback(rests);
        }
    })
}

function deleteRestaurant(db, criteria, callback) {

    db.collection(RESTAURANT).deleteMany(criteria, function (err, result) {
            assert.equal(err, null)
            callback(result);
        }
    )
}

function rateRestaurant(db, _id, score, userid, callback) {
    var result = db.collection(RESTAURANT).updateOne({_id: ObjectID(_id)}, {
        "$push": {
            score: {
                userid: userid,
                value: score
            }
        }
    })
    callback(result);
}

function updateRestaurant(db, _id, self, newRecord, callback) {
    var result = db.collection(RESTAURANT).updateOne({_id: ObjectID(_id), owner: self}, {$set: newRecord})
    callback(result);
}

function insertRestaurant(db, name, borough, cuisine, photo, street, building, zipcode, axisx, axisy, owner, callback) {
    var result = db.collection(RESTAURANT).insertOne({
        name,
        borough,
        cuisine,
        photo,
        address: {street, building, zipcode, coord: {axisx, axisy}},
        owner
    })
    callback(result);
}


