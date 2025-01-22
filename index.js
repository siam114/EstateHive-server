require("dotenv").config();
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require("cors");
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

//middleware
app.use(cors());
app.use(express.json());
app.use(bodyParser.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2iff3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

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
    const db = client.db("EstateHive");
    const userCollection = db.collection("users");
    const reviewCollection = db.collection("reviews");
    const propertyCollection = db.collection("properties");

    //middleware
    const verifyToken = (req, res, next) => {
      if (!req.headers.authorization) {
        return res.status(401).send({ message: "Forbidden Access" });
      }
      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        if (err) {
          return res.status(401).send({ message: "Forbidden Access" });
        }
        req.decoded = decoded;
        next();
      });
    };

    //save or update a user in db
    app.post("/auth/register", async (req, res) => {
      const user = req.body;
      try {
        //check if user exists in db
        const isExist = await userCollection.findOne({ email: user.email });
        if (isExist) {
          return res.status(401).send({ message: "User already exist" });
        }
        const payload = { ...user, role: "USER", create_at: new Date() };
        const result = await userCollection.insertOne(payload);
        // Generate a token
        const token = jwt.sign(
          { ...payload, _id: result.insertedId },
          process.env.ACCESS_TOKEN_SECRET,
          { expiresIn: "30day" }
        );
        return res
          .status(200)
          .json({ ...payload, _id: result.insertedId, token });
      } catch (err) {
        console.log("🚀 ~ app.post ~ err:", err);
      }
    });

    //get user info and jwt token
    app.post("/user/:email", async (req, res) => {
      try {
        const email = req.params.email;
        const query = { email };
        const result = await userCollection.findOne(query);

        // Generate a token
        const token = jwt.sign(result, process.env.ACCESS_TOKEN_SECRET, {
          expiresIn: "30day",
        });
        return res.status(200).json({ ...result, token });
      } catch (err) {
        console.log("🚀 ~ app.post ~ err:", err);
      }
    });

    //save a property in db
    app.post("/addProperty", async (req, res) => {
      const payload = {
        ...req.body,
        agent_id: new ObjectId(req.body.agent_id),
        status: "UNVERIFIED",
      };
      const result = await propertyCollection.insertOne(payload);
      res.send(result);
    });

    //get all property in db
    app.get("/properties", async (req, res) => {
      const result = await propertyCollection
        .aggregate([
          {
            $lookup: {
              from: "users",
              localField: "agent_id",
              foreignField: "_id",
              as: "agent",
            },
          },
          {
            $unwind: "$agent",
          },
          {
            $project: {
              _id: 1,
              name: 1,
              description: 1,
              min_price: 1,
              max_price: 1,
              location: 1,
              image: 1,
              status: 1,
              "agent._id": 1,
              "agent.name": 1,
              "agent.image": 1,
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    //get a property by id
    app.get("/properties/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      // const result = await propertyCollection.findOne(query);
      const result = await propertyCollection
        .aggregate([
          {
            $match: query,
          },
          {
            $lookup: {
              from: "users",
              localField: "agent_id",
              foreignField: "_id",
              as: "agent",
            },
          },
          {
            $unwind: "$agent",
          },
          {
            $project: {
              _id: 1,
              name: 1,
              description: 1,
              min_price: 1,
              max_price: 1,
              location: 1,
              image: 1,
              status: 1,
              "agent._id": 1,
              "agent.name": 1,
              "agent.image": 1,
            },
          },
        ])
        .toArray();
      res.send(result.length > 0 ? result[0] : null);
    });

    //  Add a new review
    app.post("/add-review", async (req, res) => {
      try {
        const { user_id, property_id, review } = req.body;

        // Validate request
        if (!user_id || !property_id || !review) {
          return res
            .status(400)
            .json({ success: false, message: "All fields are required." });
        }

        // Create review object
        const newReview = {
          user_id: new ObjectId(user_id),
          property_id: new ObjectId(property_id),
          review,
          createdAt: new Date(),
        };

        // Insert into database
        const result = await reviewCollection.insertOne(newReview);
        res.send(result);
      } catch (error) {
        console.error("Error adding review:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
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
  res.send("EstateHive is a Real Estate Website");
});

app.listen(port, () => {
  console.log(`EstateHive is running on port ${port}`);
});
