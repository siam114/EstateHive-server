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
    const wishlistCollection = db.collection("wishlist");

    //middleware
    const verifyToken = (req, res, next) => {
      if (
        !req.headers.authorization ||
        !req.headers.authorization.startsWith("Bearer ")
      ) {
        return res.status(401).send({ message: "Forbidden Access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      console.log("🚀 ~ verifyToken ~ token:", token);
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
        console.log("🚀 ~ jwt.verify ~ decoded:", decoded);
        if (err) {
          console.log("🚀 ~ jwt.verify ~ error:", err.message);
          return res.status(401).send({ message: "Forbidden Access" });
        }

        req.user = decoded;
        next();
      });
    };

    const verifyAdmin = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      console.log("🚀 ~ verifyAdmin ~ user:", user);
      const isAdmin = user?.role === "ADMIN";
      if (!isAdmin) {
        return res.status(403).send({ message: "Unathorized!" });
      }
      next();
    };

    const verifyAgent = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      console.log("🚀 ~ verifyAdmin ~ user:", user);
      const isAgent = user?.role === "AGENT";
      if (!isAgent) {
        return res.status(403).send({ message: "Unathorized!" });
      }
      next();
    };

    const verifyUser = async (req, res, next) => {
      const email = req.user.email;
      const query = { email: email };
      const user = await userCollection.findOne(query);
      console.log("🚀 ~ verifyAdmin ~ user:", user);
      const isUser = user?.role === "USER";
      if (!isUser) {
        return res.status(403).send({ message: "Unathorized!" });
      }
      next();
    };

    //get all users
    app.get("/users", async (req, res) => {
      const result = await userCollection.find().toArray();
      res.send(result);
    });

    //admin deleted user
    app.delete("/users/:id", verifyToken, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      const result = await userCollection.deleteOne(query);
      res.send(result);
    });

    //create a admin
    app.patch(
      "/users/admin/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "ADMIN",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
      }
    );

    //get a admin
    app.get(
      "/users/admin/:email",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const email = req.params.email;
        if (email !== req.user.email) {
          return res.status(403).send({ message: "unauthorized accesss" });
        }

        const query = { email: email };
        const user = await userCollection.findOne(query);
        let admin = false;
        if (user) {
          admin = user?.role === "ADMIN";
        }
        res.send({ admin });
      }
    );

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
    app.post("/addProperty", verifyToken, async (req, res) => {
      console.log("🚀 ~ app.post ~ req:", req.user);
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
    app.post("/add-review", verifyToken, verifyUser, async (req, res) => {
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

    // Get reviews by specific ID
    app.get("/reviews/:property_id", async (req, res) => {
      try {
        const property_id = req.params.property_id;

        // Validate property_id
        if (!ObjectId.isValid(property_id)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid property ID." });
        }

        // Query reviews
        const reviews = await reviewCollection
          .aggregate([
            { $match: { property_id: new ObjectId(property_id) } },
            {
              $lookup: {
                from: "users",
                localField: "user_id",
                foreignField: "_id",
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $project: {
                _id: 1,
                review: 1,
                createdAt: 1,
                "user._id": 1,
                "user.name": 1,
                "user.image": 1,
              },
            },
          ])
          .toArray();

        res.send(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
    });

    //  Get all reviews
    app.get("/reviews", async (req, res) => {
      try {
        const reviews = await reviewCollection
          .aggregate([
            {
              $lookup: {
                from: "users",
                localField: "user_id",
                foreignField: "_id",
                as: "user",
              },
            },
            { $unwind: "$user" },
            {
              $lookup: {
                from: "properties",
                localField: "property_id",
                foreignField: "_id",
                as: "property",
              },
            },
            { $unwind: "$property" },
            {
              $project: {
                _id: 1,
                review: 1,
                createdAt: 1,
                "user._id": 1,
                "user.name": 1,
                "user.image": 1,
                "property._id": 1,
                "property.name": 1,
              },
            },
            { $sort: { createdAt: -1 } },
            { $limit: 3 },
          ])
          .toArray();

        res.send(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
        res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
    });

    //add to wishlist
    app.post("/wishlist", verifyToken, verifyUser, async (req, res) => {
      const property_id = req.body.property_id;
      const user_id = req.user._id;
      if (!user_id || !property_id) {
        return res.status(400).send({ message: "Invalid Data Provided" });
      }

      try {
        const result = await wishlistCollection.updateOne(
          { user_id: new ObjectId(user_id), property_id: new ObjectId(property_id) },
          {
            $setOnInsert: { created_at: new Date() },
            $set: { updated_at: new Date() },
          },
          { upsert: true } 
        );
        

        // Response
        if (result.upsertedCount > 0) {
          res
            .status(201)
            .send({
              message: "Wishlist item added",
              upsertedId: result.upsertedId,
            });
        } else {
          res.status(200).send({ message: "Wishlist item updated" });
        }
      } catch (err) {
        console.log("🚀 ~ app.post ~ err:", err)
        res.status(500).send({ message: "Internal Server Error" });
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
