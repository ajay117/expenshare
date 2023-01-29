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
  moderatorRequests: [{}],
  moderator: [String],
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

const clusterPassword = process.env.MONGO_DB_CLUSTER_PWD;

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
    res.redirect("/login");
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
    res.redirect("/login");
  }
});

app.get("/groups/:groupId", async (req, res) => {
  const { groupId } = req.params;
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

app.get("/groups/:groupId/:index/edit", async (req, res) => {
  let { groupId, index } = req.params;
  const groupObj = await Group.findById(groupId);

  res.render("groups/editGroup", {
    admin: req.user ? req.user._id.equals(groupObj.admin) : false,
    user: req.user,
    groupObj: groupObj,
    index: index,
  });
});

app.get("/admin/:adminId/groups/:groupId/edit", async (req, res) => {
  const { adminId, groupId } = req.params;
  const groupObj = await Group.findById(groupId);
  res.render("groups/editGroupInfo", {
    adminId: adminId,
    groupId: groupId,
    groupObj: groupObj,
    admin: req.user ? req.user._id.equals(groupObj.admin) : false,
    user: req.user,
  });
});

app.get("/admin/:adminId/groups/:groupId/change-admin", async (req, res) => {

  let { adminId, groupId } = req.params;
  groupId = mongoose.Types.ObjectId(groupId);
  adminId = mongoose.Types.ObjectId(adminId);

  // let user = await User.findById({ _id: adminId });
  let group = await Group.findById({ _id: groupId });

  if(!req.user._id.equals(group.admin)) {
    res.redirect('/');
    return;
  }


  let moderatorsObjectId = group.moderator.map((id) => {
    return mongoose.Types.ObjectId(id);
  });

  let moderatorUserNameArr = await User.find({
    _id: {
      $in: [...moderatorsObjectId],
    },
  });

  res.render("groups/newAdmin", {
    group: group,
    // user: user,
    // username: user.username,
    moderatorUserNameArr: moderatorUserNameArr,
    user: req.user,
    admin: req.user ? req.user._id.equals(group.admin) : false,
  });
});

app.put(
  "/admin/:adminId/groups/:groupId/moderator/:moderatorId/change-admin",
  async (req, res) => {
    let { adminId, groupId, moderatorId } = req.params;

    let group = await Group.findById({ _id: mongoose.Types.ObjectId(groupId) });
    group.admin = mongoose.Types.ObjectId(moderatorId);
    group.moderator.splice(group.moderator.indexOf(moderatorId), 1);

    await group.save();
    res.redirect("/");
  }
);

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

  res.redirect("/groups");
});

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
    successFlash: { type: "success", message: "Welcome" },
    failureRedirect: "/login",
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

app.post("/groups/:groupId/moderator-request/:userId", async (req, res) => {
  let { groupId, userId } = req.params;
  const { message } = req.body;
  console.log({ message, userId });
  groupId = mongoose.Types.ObjectId(groupId);
  userId = mongoose.Types.ObjectId(userId);

  let group = await Group.findById({ _id: groupId });
  let oldRequests = group.moderatorRequests;
  let newRequest = [{ userId, message }];
  group.moderatorRequests = [...oldRequests, ...newRequest];

  await group.save();
  res.redirect("/groups/" + groupId);
});

app.put(
  "/admin/:adminId/groups/:groupId/moderator-request/:index/accept",
  async (req, res) => {
    let { adminId, groupId, index } = req.params;
    groupId = mongoose.Types.ObjectId(groupId);
    let group = await Group.findById({ _id: groupId });

    let oldModeratorData = group.moderator;
    let newModeratorData = group.moderatorRequests[index].userId;

    group.moderator = [...oldModeratorData, newModeratorData];
    group.moderatorRequests.splice(index, 1);
    await group.save();

    res.redirect("/admin/" + adminId);
  }
);

app.delete(
  "/admin/:adminId/groups/:groupId/moderator-request/:index/reject",
  async (req, res) => {
    let { adminId, groupId, index } = req.params;
    groupId = mongoose.Types.ObjectId(groupId);
    let group = await Group.findById({ _id: groupId });

    group.moderatorRequests.splice(index, 1);
    await group.save();

    res.redirect("/admin/" + adminId);
  }
);

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
});

app.delete("/groups/:groupId/:index", async (req, res) => {
  let { groupId, index } = req.params;
  const objectId = mongoose.Types.ObjectId(groupId);
  index = parseInt(index);

  let group = await Group.findById({ _id: objectId });
  let { member, item, price, date } = group.transaction[index];

  let field = `transaction.${index}`;
  let fieldValue = `transaction.${index}`;

  await Group.updateOne({ _id: objectId }, { $unset: { [field]: 1 } });
  await Group.updateOne({ _id: objectId }, { $pull: { transaction: null } });

  res.redirect("/groups/" + groupId);
});

app.delete("/admin/:adminId/groups/:groupId", async (req, res) => {
  const { groupId, adminId } = req.params;
  const objectId = mongoose.Types.ObjectId(groupId);
  await Group.deleteOne({ _id: objectId });

  res.redirect("/admin/" + adminId);
});

app.put("/admin/:adminId/groups/:groupId/update", async (req, res) => {
  let { groupId, adminId } = req.params;

  const { group_name, new_member } = req.body;
  groupId = mongoose.Types.ObjectId(groupId);
  let group = await Group.findById({ _id: groupId });

  if (new_member) {
    let oldMember = group.member;
    group.member = [...oldMember, new_member];
  }
  if (group.groupName !== group_name) {
    group.groupName = group_name;
  }
  await group.save();
  res.redirect("/admin/" + adminId);
});

app.delete(
  "/admin/:adminId/groups/:groupId/member/:index/delete",
  async (req, res) => {
    let { groupId, index, adminId } = req.params;
    groupId = mongoose.Types.ObjectId(groupId);
    let group = await Group.findById({ _id: groupId });

    group.member.splice(index, 1);
    await group.save();

    res.redirect("/admin/" + adminId);
  }
);

app.listen(process.env.PORT || 3000, () => {
  console.log("Server is listening on port 3000");
});
