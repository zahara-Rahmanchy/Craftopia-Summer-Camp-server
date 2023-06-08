const express = require("express");
const app = express();
const cors = require("cors");
const port = process.env.PORT || 5000;
require("dotenv").config();
const jwt = require("jsonwebtoken");
const {MongoClient, ServerApiVersion, ObjectId} = require("mongodb");

// middleware
app.use(cors());
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
    await client.connect();

    const usersCollection = client.db("Craftopia").collection("users");

    await client.db("admin").command({ping: 1});
    console.log(
      "Pinged your deployment. You successfully connected to MongoDB!"
    );
    // jwt
    app.post("/jwt", (req, res) => {
      const user = req.body;
      console.log("jwt user", user);
      const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, {
        expiresIn: "2h",
      });
      res.send({token});
    });

    // users collection:all student,instructor,admin:viewed to admin only
    app.get("/users", verifyJWT, async (req, res) => {
      const result = await usersCollection.find().toArray();
      res.send(result);
    });
    app.post("/users", async (req, res) => {
      const user = req.body;
      const query = {email: user.email};
      const existingUser = await usersCollection.findOne(query);
      console.log("user", user);
      console.log("existingUser:  ", existingUser);
      if (existingUser) {
        return res.send({message: "The User already exits"});
      }
      const result = await usersCollection.insertOne(user);
      res.send(result);
    });
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
