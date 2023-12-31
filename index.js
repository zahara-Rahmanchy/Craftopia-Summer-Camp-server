const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
const stripe = require("stripe")(process.env.PAYMENT_SECRET);
const jwt = require("jsonwebtoken");
const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");

// middleware
const corsOptions = {
  origin: "*",
  credentials: true,
  optionSuccessStatus: 200,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
};

app.use(cors(corsOptions));
app.use(express.json());

// jwt
const verifyJWT = (req, res, next) => {
  // we will first check there is authorization, if not then it means not a valid user
  const authorization = req.headers.authorization;
  if (!authorization) {
    return res.status(401).send({error: true, message: "Unauthorized Access!"});
  }
  // the token is in this form bearer space token, so split using space

  const token = authorization.split(" ")[1];

  jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
    if (err) {
      return res
        .status(401)
        .send({error: true, message: "Unauthorized Access!"});
    }
    req.decoded = decoded;
    next();
  });
};

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.ofsmeh8.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();

    const usersCollection = client.db("Craftopia").collection("users");
    const classCollection = client.db("Craftopia").collection("classes");
    const selectedClassCollection = client
      .db("Craftopia")
      .collection("selectedClasses");

    const paymentsCollection = client.db("Craftopia").collection("payment");

    // jwt
    app.post("/jwt", (req, res) => {
      const user = req.body;
      // console.log("jwt user", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "1h",
      });
      res.send({token});
    });

    // creating the verify admin middleware
    const verifyAdmin = async (req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);

      if (user?.role !== "admin") {
        return res.status(403).send({error: true, message: "Forbidden access"});
      }
      next();
    };
    // -----------------------------------------------VERIFY instructor middleware-----------------------------------------------------------------
    const verifyInstructor = async (req, res, next) => {
      const email = req.decoded.email;
      const query = {email: email};
      const user = await usersCollection.findOne(query);

      if (user?.role !== "instructor") {
        return res.status(403).send({error: true, message: "Forbidden access"});
      }
      next();
    };

    // --------------------------------------------------------------------------------------
    // users collection:all student,instructor,admin:viewed to admin only
    app.get("/users", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });

    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = {email: user.email};
      const existingUser = await usersCollection.findOne(query);
      // console.log("user", user);
      // console.log("existingUser:  ", existingUser);
      if (existingUser) {
        return res.send({message: "The User already exits"});
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });

    // update user role,only admin can so verify jwt and verify admin

    app.patch("/users/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const role = req.body.role;
      const clicked = req.body.clicked;
      console.log("role", role);
      const query = {_id: new ObjectId(id)};

      const updatedDoc = {
        $set: {
          role: role,
          clicked: clicked,
        },
      };

      const result = await usersCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    //-------------------------------------  CHECK ADMIN to get data using email--------------------------------------------------------------------------
    app.get("/users/admin/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = {email: email};

      if (req.decoded.email !== email) {
        res.send({admin: false});
      }
      const user = await usersCollection.findOne(query);
      const result = {admin: user?.role === "admin"};
      res.send(result);
    });

    // ------------------------------------------------Instructors--------------------------------------------------------------------------------
    app.get("/users/instructor/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const query = {email: email};

      if (req.decoded.email !== email) {
        res.send({instructor: false});
      }
      const user = await usersCollection.findOne(query);
      const result = {instructor: user?.role === "instructor"};
      res.send(result);
    });

    // ------------------------------------------Classes for instructor----------------------------------------------------------
    app.post(
      "/class",
      cors(),
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const newItem = req.body;
        const result = await classCollection.insertOne(newItem);
        res.send(result);
      }
    );
    // shows instructor the classes added by using email
    app.get(
      "/class/instructor/:email",
      verifyJWT,
      verifyInstructor,
      async (req, res) => {
        const email = req.params.email; // Get the email from the route parameters
        const result = await classCollection.find({email: email}).toArray(); // Fetch classes based on the email
        res.send(result);
      }
    );

    // ------------------------------------------Get all instructors for insturtor page---------------------------------------------
    app.get("/instructors", async (req, res) => {
      const result = await usersCollection.find({role: "instructor"}).toArray();
      res.send(result);
    });
    // ----------------------------------------Admin manage classes--------------------------------------------
    app.get("/class", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await classCollection.find().toArray();
      res.send(result);
    });

    // -----------------------------------------Admin updating the class status--------------------------------------------------------

    app.patch("/class/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const {status, clicked, feedback} = req.body;
      const updatedDoc = {
        $set: {},
      };

      if (status) {
        updatedDoc.$set.status = status;
      }

      if (clicked) {
        updatedDoc.$set.clicked = clicked;
      }

      if (feedback) {
        updatedDoc.$set.feedback = feedback;
      }
      console.log("status", status);
      const query = {_id: new ObjectId(id)};

      // const updatedDoc = {
      //   $set: {
      //     status: status,
      //     clicked: clicked,
      //   },
      // };

      const result = await classCollection.updateOne(query, updatedDoc);
      res.send(result);
    });

    // ------------------------------Approved classes------------------------------------------------
    app.get("/classes", async (req, res) => {
      const result = await classCollection.find({status: "approved"}).toArray();
      res.send(result);
    });
    // -----------------------------------insert  selected class-------------------------------------------------------
    app.post(
      "/selectedClass",
      verifyJWT,

      async (req, res) => {
        const newItem = req.body;
        console.log(newItem);
        const result = await selectedClassCollection.insertOne(newItem);
        res.send(result);
      }
    );

    app.get("/selectedClass", verifyJWT, async (req, res) => {
      const result = await selectedClassCollection.find().toArray();
      res.send(result);
    });
    app.delete("/selectedClass/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;

      const query = {$or: [{_id: id}, {_id: new ObjectId(id)}]};
      const result = await selectedClassCollection.deleteOne(query);
      console.log("query", query, "result", result);
      res.send(result);
    });

    // ------------PAyment----------------------------------
    app.post("/create-payment-intent", verifyJWT, async (req, res) => {
      const {price} = req.body;
      // convert the amount to pennies
      const amount = parseInt(price * 100);
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    // -----------------------------------------payment history-----------------------------------------------

    app.post("/payments", verifyJWT, async (req, res) => {
      const q = req.body;
      const result = await paymentsCollection.insertOne(q);
      console.log(req.body.classId);
      // delete from selected class using _id
      const del = {
        $or: [
          {classId: req.body.classId},
          {classId: new ObjectId(req.body.classId)},
        ],
      };

      // =----------------------------------------fetch the data using findOne and update from classes------------------------------
      const clas = await classCollection.findOne({
        _id: new ObjectId(req.body.classId),
      });
      console.log(clas);
      const currentAvailableSeats = clas.availableSeat;
      const totalEnrolled = clas.totalEnrolled;
      console.log(currentAvailableSeats, totalEnrolled);
      const updateFilter = {_id: new ObjectId(req.body.classId)};
      const updateDoc = {
        $set: {
          availableSeat: currentAvailableSeats - 1,
          totalEnrolled: totalEnrolled + 1,
        },
      };
      const deleteResult = await selectedClassCollection.deleteOne(del);
      const updateResult = await classCollection.updateOne(
        updateFilter,
        updateDoc
      );

      res.send({result, deleteResult, updateResult});
    });

    // ------------------------------------Enrolled classes after payment and payment history---------------------------------------------------------------------

    app.get("/payments/:email", verifyJWT, async (req, res) => {
      const email = req.params.email;
      const result = await paymentsCollection
        .find({email: email})
        .sort({date: -1})
        .toArray();
      res.send(result);
    });

    // -----------------------------------------classes based on students--------------------------------------------------------------------

    app.get("/classessorted", async (req, res) => {
      const result = await classCollection
        .find({status: "approved"})
        .sort({totalEnrolled: -1})
        .limit(6)
        .toArray();
      res.send(result);
    });

    await client.db("admin").command({ping: 1});
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get("/", (req, res) => {
  res.send("Hello from Summer Camp");
});

app.listen(port, () => {
  console.log("port", port);
});
