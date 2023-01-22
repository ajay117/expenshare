require("dotenv").config();

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const ejs = require("ejs");
const session = require("express-session");
const passportLocalMongoose = require("passport-local-mongoose");
const passport = require("passport");
const flash = require("connect-flash");
const methodOverride = require("method-override");

app.use(express.static(__dirname + "/public"));
app.use(
  express.urlencoded({
    extended: true,
  })
);
app.use(
  session({
    secret: "This is a secret",
    resave: false,
    saveUninitialized: false,
  })
);

app.use(methodOverride("_method"));
app.use(flash());

app.set("view engine", "ejs");

app.use((req, res, next) => {
  res.locals.message = req.flash();
  next();
});

//Configure passport middleware
app.use(passport.initialize());
app.use(passport.session());

const groupSchema = new mongoose.Schema({
  groupName: String,
  admin: mongoose.Types.ObjectId,
  member: [String],
  transaction: [{}],
});

const Group = mongoose.model("Group", groupSchema);

const userSchema = new mongoose.Schema({
  username: String,
  password: String,
});

const options = {
  errorMessages: {
    IncorrectPasswordError: "Username or Password is incorrect",
    IncorrectUsernameError: "Username or Password is incorrect",
  },
};
userSchema.plugin(passportLocalMongoose, options);

//Configure passport-local to use account model for authentication
const User = mongoose.model("User", userSchema);
passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

mongoose.connect("mongodb://localhost:27017/expense-share");

// const clusterPassword = process.env.MONGO_DB_CLUSTER_PWD;

// async function connectDb() {
//   await mongoose.connect(
//     "mongodb+srv://meajay64:" +
//       clusterPassword +
//       "@expenseshare.z2heqoo.mongodb.net/expense-share?retryWrites=true&w=majority"
//   );
// }

// connectDb().catch((err) => console.log(err));

// Get Routes
app.get("/", (req, res) => {
  res.render("home", { user: req.user });
});

app.get("/register", (req, res) => {
  res.render("register", { user: req.user });
});

app.get("/login", (req, res) => {
  res.render("login", { user: req.user });
});

app.get("/admin/:id", async (req, res) => {
  if (req.user) {
    const userGroup = await Group.find({ admin: req.user });

    res.render("admin", { user: req.user, userGroup: userGroup });
  } else {
    console.log("Please Log in");
  }
});

app.get("/groups", async (req, res) => {
  const groups = await Group.find();
  res.render("groups/groups", { groups: groups, user: req.user });
});

app.get("/groups/new", (req, res) => {
  if (req.user) {
    res.render("groups/new", { user: req.user });
  } else {
    console.log("Please log in");
    res.redirect("/login");
  }
});

app.get("/groups/:groupId", async (req, res) => {
  const { groupId } = req.params;
  // const groups = await Group.find();
  // const groupObj = groups.find(
  //   (obj) => obj.groupName.toLowerCase() === groupName
  // );

  const groupObj = await Group.findById(groupId);

  let total = 0;

  groupObj.transaction.forEach((obj) => {
    total += obj.price;
  });

  let individualTotalExp = {};

  groupObj.member.forEach((person) => {
    let transactionObj = groupObj.transaction;
    for (let i = 0; i < transactionObj.length; i++) {
      if (!individualTotalExp.hasOwnProperty(person)) {
        individualTotalExp[person] = 0;
      }
      if (transactionObj[i].member === person) {
        individualTotalExp[person] += transactionObj[i].price;
      }
    }
  });
  console.log({ groupObj, total, individualTotalExp }, req.user);
  res.render("groups/group", {
    groupObj: groupObj,
    total: total,
    individualTotalExp: individualTotalExp,
    admin: req.user ? req.user._id.equals(groupObj.admin) : false,
    user: req.user,
  });
});

app.get("/groups/:groupId/:index/edit", async (req, res) => {
  let { groupId, index } = req.params;
  const groupObj = await Group.findById(groupId);

  res.render("groups/editGroup", {
    admin: req.user ? req.user._id.equals(groupObj.admin) : false,
    groupObj: groupObj,
    index: index,
    user: req.user,
  });
});

//Post Routes
app.post("/groups", (req, res) => {
  let group = {
    admin: req.user._id,
    transaction: [],
  };
  let body = req.body;
  for (let key in body) {
    if (key === "group_name") {
      group.groupName = body.group_name;
    } else {
      if (!group.member) {
        group.member = [];
        group.member.push(body[key]);
      } else {
        group.member.push(body[key]);
      }
    }
  }

  Group.find({ groupName: group.groupName }, async (err, result) => {
    if (result.length !== 0) {
      console.log("Sorry this group already exists");
    } else {
      const newGroup = new Group(group);
      await newGroup.save();
    }
  });

  // groups.push(group);
  res.redirect("/groups");
});

// app.post('/groups/:id', (req,res) => {

// })

app.post("/register", (req, res) => {
  User.register(
    new User({ username: req.body.username }),
    req.body.password,
    (err) => {
      if (err) {
        req.flash("error", "User is already registered");
        res.redirect("/register");
      } else {
        passport.authenticate("local")(req, res, function () {
          req.flash("success", "Successfully Registered!");
          res.redirect("/");
        });
      }
    }
  );
});

app.post("/groups/transaction", async (req, res) => {
  let { member, item, price, date, groupId } = req.body;
  price = parseInt(price);

  const group = await Group.findById(groupId);
  group.transaction.push({
    member,
    item,
    price,
    date,
  });

  await group.save();

  req.flash("success", "Transaction successfully recorded");

  res.redirect("/groups/" + groupId);
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/",
    failureRedirect: "/login",
    successFlash: { type: "success", message: "Welcome" },
    failureFlash: { type: "error", message: "Invalid username or password." },
  })
);

app.post("/logout", (req, res) => {
  req.logout((err) => {
    if (err) {
      console.log("Error occured when logging out: " + err);
    } else {
      res.redirect("/login");
    }
  });
});

// app.post("/group/:id/edit")

app.put("/groups/:groupId/:index", async (req, res) => {
  let { groupId, index } = req.params;
  let { member, item, price, date } = req.body;
  index = parseInt(index);
  price = parseInt(price);
  let objectId = mongoose.Types.ObjectId(groupId);

  let fieldOne = `transaction.${index}.member`;
  let fieldTwo = `transaction.${index}.item`;
  let fieldThree = `transaction.${index}.price`;
  let fieldFour = `transaction.${index}.date`;
  await Group.updateOne(
    { _id: objectId },
    {
      $set: {
        [fieldOne]: member,
        [fieldTwo]: item,
        [fieldThree]: price,
        [fieldFour]: date,
      },
    }
  );

  req.flash("success", "Transaction successfully updated");
  res.redirect("/groups/" + groupId);
  // await group.save();
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server is listening on port 3000");
});

// 63ae797d88f29ba7a632ba97
