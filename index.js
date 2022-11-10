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

// const groups = [
//   {
//     groupName: "ABC",
//     admin: "RC",
//     member: ["Babu", "Ajay", "Hemanta", "RC"],
//     transaction: [
//       {
//         member: "RC",
//         date: "2020-03-11",
//         item: "Hanaro",
//         price: 200000,
//       },
//       {
//         member: "Ajay",
//         date: "2020-03-11",
//         item: "Hanaro",
//         price: 80000,
//       },
//       {
//         member: "Ajay",
//         date: "2020-03-11",
//         item: "Hanaro",
//         price: 200000,
//       },
//       {
//         member: "Ajay",
//         date: "2020-03-11",
//         item: "Hanaro",
//         price: 200000,
//       },
//     ],
//   },
//   {
//     groupName: "ABC2",
//     admin: "Ajay",
//     member: ["Sanjay", "Bikash", "Hari", "Ramesh"],
//     transaction: [
//       {
//         member: "Hari",
//         date: "2020/12/11",
//         item: "Hanaro",
//         price: 200000,
//       },
//     ],
//   },
// ];

// const adminList = [
//   {
//     name: "RC",
//     groupName: "ABC",
//   },
//   {
//     name: "Ajay",
//     groupName: "ABC2",
//   },
// ];

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

app.use(flash());

app.set("view engine", "ejs");

app.use((req, res, next) => {
  res.locals.message = req.flash();
  next();
});

//Configure passport middleware
app.use(passport.initialize());
app.use(passport.session());

//Schemas
// const transactionSchema = new mongoose.Schema({
//   member: String,
//   item: String,
//   price:
// })

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

userSchema.plugin(passportLocalMongoose);

//Configure passport-local to use account model for authentication
const User = mongoose.model("User", userSchema);
passport.use(User.createStrategy());

passport.serializeUser(User.serializeUser());
passport.deserializeUser(User.deserializeUser());

mongoose.connect("mongodb://localhost:27017/expense-share");

// const clusterPassword = process.env.MONGO_DB_CLUSTER_PWD;
// mongoose.connect(
//   `mongodb+srv://meajay64:${clusterPassword}@expenseshare.z2heqoo.mongodb.net/?retryWrites=true&w=majority`
// );

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

app.get("/admin/:id", (req, res) => {
  if (req.user) {
    res.render("admin", { user: req.user });
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
  const groups = await Group.find();
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
  res.render("groups/group", {
    groupObj: groupObj,
    total: total,
    individualTotalExp: individualTotalExp,
    admin: req.user ? req.user._id.equals(groupObj.admin) : false,
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
      } else {
        req.flash("success", "Successfully Registered!");
        res.redirect("/login");
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
  passport.authenticate("local", { failureRedirect: "/login" }),
  (req, res) => {
    req.flash("success", "Successfully logged in!");
    console.log("logged in");
    res.redirect("/admin/" + req.user._id);
  }
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

app.listen(process.env.PORT || 3000, () => {
  console.log("Server is listening on port 3000");
});
