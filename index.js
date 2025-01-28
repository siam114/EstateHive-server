require("dotenv").config();
const express = require("express");
const app = express();
const jwt = require("jsonwebtoken");
const bodyParser = require("body-parser");
const cors = require("cors");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
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
    const marketPlaceCollection = db.collection("marketplace");

    //middleware
    const verifyToken = (req, res, next) => {
      if (
        !req.headers.authorization ||
        !req.headers.authorization.startsWith("Bearer ")
      ) {
        return res.status(401).send({ message: "Forbidden Access" });
      }

      const token = req.headers.authorization.split(" ")[1];
      jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
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

    //create a agent
    app.patch(
      "/users/agent/:id",
      verifyToken,
      verifyAdmin,
      async (req, res) => {
        const id = req.params.id;
        const filter = { _id: new ObjectId(id) };
        const updatedDoc = {
          $set: {
            role: "AGENT",
          },
        };
        const result = await userCollection.updateOne(filter, updatedDoc);
        res.send(result);
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
    app.get("/user/:email", async (req, res) => {
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
      const status = req.query.status;
      const result = await propertyCollection
        .aggregate([
          {
            $match: !status
              ? {
                  status: { $ne: "REJECTED" },
                }
              : {
                  $and: [{ status: { $ne: "REJECTED" } }, { status }],
                },
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
              "agent.email": 1,
            },
          },
        ])
        .toArray();
      res.send(result);
    });

    //get specific property in db
    app.get("/user-properties", verifyToken, async (req, res) => {
      const user_id = req.user._id;
      const result = await propertyCollection
        .aggregate([
          { $match: { agent_id: new ObjectId(user_id) } },
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

    //patch update property
    app.patch("/properties/:id", verifyToken, verifyAgent, async (req, res) => {
      const item = req.body;
      const id = req.params.id;
      const filter = { _id: new ObjectId(id) };
      const updatedDoc = {
        $set: {
          name: item.name,
          description: item.description,
          min_price: item.min_price,
          max_price: item.max_price,
          location: item.location,
          image: item.image,
        },
      };

      const result = await propertyCollection.updateOne(filter, updatedDoc);
      res.send(result);
    });

    // Delete a property by ID (only accessible to the agent who owns the property)
    app.delete(
      "/properties/:id",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        try {
          const propertyId = req.params.id;

          // Validate the property ID
          if (!ObjectId.isValid(propertyId)) {
            return res
              .status(400)
              .json({ success: false, message: "Invalid property ID." });
          }

          // Find the property and check if it belongs to the logged-in agent
          const property = await propertyCollection.findOne({
            _id: new ObjectId(propertyId),
          });
          if (!property) {
            return res
              .status(404)
              .json({ success: false, message: "Property not found." });
          }

          if (property.agent_id != req.user._id) {
            return res.status(403).json({
              success: false,
              message: "You are not authorized to delete this property.",
            });
          }

          // Delete the property
          const result = await propertyCollection.deleteOne({
            _id: new ObjectId(propertyId),
          });
          if (result.deletedCount === 0) {
            return res.status(404).json({
              success: false,
              message: "Property not found or already deleted.",
            });
          }

          res.json({
            success: true,
            message: "Property deleted successfully.",
          });
        } catch (error) {
          console.error("Error deleting property:", error);
          res
            .status(500)
            .json({ success: false, message: "Internal server error." });
        }
      }
    );

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

    //verification post
    app.post("/verify-property", verifyToken, verifyAdmin, async (req, res) => {
      const { status, property_id } = req.body;
      const filter = { _id: new ObjectId(property_id) };
      const updatedDoc = {
        $set: {
          status,
        },
      };
      const result = await propertyCollection.updateOne(filter, updatedDoc);
      res.send(result);
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
          created_at: new Date(),
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

    //  Get all reviews
    app.get("/all-reviews", async (req, res) => {
      const limit = req.query.limit;
      const aggregateQuery = [
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
            created_at: 1,
            "user._id": 1,
            "user.name": 1,
            "user.image": 1,
            "property._id": 1,
            "property.name": 1,
          },
        },
        { $sort: { created_at: -1 } },   
      ]
      if(limit){
        aggregateQuery.push({ $limit: Number(limit) })
      }
      try {
        const reviews = await reviewCollection
          .aggregate(aggregateQuery)
          .toArray();
        res.send(reviews);
      } catch (error) {
        console.error("Error fetching reviews:", error);
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
                created_at: 1,
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

    // Get reviews by user ID
    app.get(
      "/my-reviews/:user_id",
      verifyToken,
      verifyUser,
      async (req, res) => {
        try {
          const user_id = req.params.user_id;

          // Validate user_id
          if (!ObjectId.isValid(user_id)) {
            return res
              .status(400)
              .json({ success: false, message: "Invalid user ID." });
          }

          // Query reviews by user ID
          const reviews = await reviewCollection
            .aggregate([
              { $match: { user_id: new ObjectId(user_id) } },
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
                $lookup: {
                  from: "users",
                  localField: "property.agent_id",
                  foreignField: "_id",
                  as: "agent",
                },
              },
              { $unwind: "$agent" },
              {
                $project: {
                  _id: 1,
                  review: 1,
                  created_at: 1,
                  "property.name": 1,
                  "agent.name": 1,
                },
              },
            ])
            .toArray();

          res.send(reviews);
        } catch (error) {
          console.error("Error fetching user's reviews:", error);
          res
            .status(500)
            .json({ success: false, message: "Internal server error." });
        }
      }
    );

    // Delete a review by ID
    app.delete("/delete-review/:id", verifyToken, async (req, res) => {
      try {
        const reviewId = req.params.id;

        // Validate review ID
        if (!ObjectId.isValid(reviewId)) {
          return res
            .status(400)
            .json({ success: false, message: "Invalid review ID." });
        }

        // Delete the review
        const result = await reviewCollection.deleteOne({
          _id: new ObjectId(reviewId),
        });

        if (result.deletedCount === 0) {
          return res
            .status(404)
            .json({ success: false, message: "Review not found." });
        }

        res.json({ success: true, message: "Review deleted successfully." });
      } catch (error) {
        console.error("Error deleting review:", error);
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
          {
            user_id: new ObjectId(user_id),
            property_id: new ObjectId(property_id),
          },
          {
            $setOnInsert: { created_at: new Date() },
            $set: { updated_at: new Date() },
          },
          { upsert: true }
        );

        // Response
        if (result.upsertedCount > 0) {
          res.status(201).send({
            message: "Wishlist item added",
            upsertedId: result.upsertedId,
          });
        } else {
          res.status(200).send({ message: "Wishlist item updated" });
        }
      } catch (err) {
        console.log("🚀 ~ app.post ~ err:", err);
        res.status(500).send({ message: "Internal Server Error" });
      }
    });

    //get to wishlist
    app.get("/wishlist", verifyToken, verifyUser, async (req, res) => {
      try {
        const reviews = await wishlistCollection
          .aggregate([
            { $match: { user_id: new ObjectId(req.user._id) } },
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
              $lookup: {
                from: "users",
                localField: "property.agent_id",
                foreignField: "_id",
                as: "agent",
              },
            },
            { $unwind: "$agent" },
            {
              $project: {
                _id: 1,
                review: 1,
                created_at: 1,
                "user._id": 1,
                "user.name": 1,
                "user.email": 1,
                "user.image": 1,
                "property._id": 1,
                "property.name": 1,
                "property.status": 1,
                "property.image": 1,
                "property.location": 1,
                "property.min_price": 1,
                "property.max_price": 1,
                "property.description": 1,
                "agent._id": 1,
                "agent.name": 1,
                "agent.email": 1,
                "agent.image": 1,
              },
            },
            { $sort: { created_at: -1 } },
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

    //get a wishlist by id
    app.get("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: new ObjectId(id) };
      // const result = await propertyCollection.findOne(query);
      const result = await wishlistCollection
        .aggregate([
          {
            $match: query,
          },
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
            $lookup: {
              from: "users",
              localField: "property.agent_id",
              foreignField: "_id",
              as: "agent",
            },
          },
          { $unwind: "$agent" },
          {
            $project: {
              _id: 1,
              review: 1,
              created_at: 1,
              "user._id": 1,
              "user.name": 1,
              "user.email": 1,
              "user.image": 1,
              "property._id": 1,
              "property.name": 1,
              "property.status": 1,
              "property.image": 1,
              "property.location": 1,
              "property.min_price": 1,
              "property.max_price": 1,
              "property.description": 1,
              "agent._id": 1,
              "agent.name": 1,
              "agent.email": 1,
              "agent.image": 1,
            },
          },
        ])
        .toArray();
      res.send(result.length > 0 ? result[0] : null);
    });

    //delete wishlist
    app.delete("/wishlist/:id", async (req, res) => {
      const id = req.params.id;
      const result = await wishlistCollection.deleteOne({
        _id: new ObjectId(id),
      });
      res.send(result);
    });

    //make an offer
    app.post("/bid-property", verifyToken, verifyUser, async (req, res) => {
      const { agent_id, property_id, offer_amount } = req.body;
      const user_id = req.user._id;
      try {
        const result = await marketPlaceCollection.updateOne(
          {
            property_id: new ObjectId(property_id),
            user_id: new ObjectId(user_id),
          },
          {
            $set: {
              offer_amount,
              status: "PENDING",
              updated_at: new Date(),
            },
            $setOnInsert: {
              agent_id: new ObjectId(agent_id),
              buying_date: null,
              create_at: new Date(),
            },
          },
          {
            upsert: true,
          }
        );
        res.send(result);
      } catch (err) {
        console.error("Error fetching reviews:", err);
        res
          .status(500)
          .json({ success: false, message: "Internal server error." });
      }
    });

    //get bought property
    app.get(
      "/bought-properties",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        try {

          const result = await marketPlaceCollection
            .aggregate([
              {
                $match: {
                  $and: [
                    { status: "PAID" },
                    { agent_id: new ObjectId(req.user._id) },
                  ],
                },
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
                $unwind: {
                  path: "$agent",
                  preserveNullAndEmptyArrays: true, // Handle cases where no matching agent is found
                },
              },
              {
                $lookup: {
                  from: "users",
                  localField: "user_id",
                  foreignField: "_id",
                  as: "user",
                },
              },
              {
                $unwind: {
                  path: "$user",
                  preserveNullAndEmptyArrays: true, // Handle cases where no matching user is found
                },
              },
              {
                $lookup: {
                  from: "properties",
                  localField: "property_id",
                  foreignField: "_id",
                  as: "property",
                },
              },
              {
                $unwind: {
                  path: "$property",
                  preserveNullAndEmptyArrays: true, // Handle cases where no matching property is found
                },
              },
              {
                $project: {
                  _id: 1,
                  created_at: 1,
                  status: 1,
                  offer_amount: 1,
                  transection_id: 1,
                  buying_date: 1,
                  "user._id": 1,
                  "user.name": 1,
                  "user.email": 1,
                  "user.image": 1,
                  "property._id": 1,
                  "property.name": 1,
                  "property.image": 1,
                  "property.location": 1,
                  "property.min_price": 1,
                  "property.max_price": 1,
                  "property.description": 1,
                  "agent._id": 1,
                  "agent.name": 1,
                  "agent.email": 1,
                  "agent.image": 1,
                },
              },
            ])
            .toArray();

          res.status(200).send(result);
        } catch (error) {
          console.error("🚀 ~ app.get error:", error);
          res.status(500).json({
            success: false,
            message: "Failed to fetch bought properties.",
            error: error.message,
          });
        }
      }
    );

    app.get("/offered-properties", verifyToken, async (req, res) => {
      try {

        const result = await marketPlaceCollection
          .aggregate([
            {
              $match: {
                $and: [
                  { status: { $ne: "REJECTED" } },
                  req.user.role === "USER"
                    ? { user_id: new ObjectId(req.user._id) }
                    : { agent_id: new ObjectId(req.user._id) },
                ],
              },
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
              $unwind: {
                path: "$agent",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "user_id",
                foreignField: "_id",
                as: "user",
              },
            },
            {
              $unwind: {
                path: "$user",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $lookup: {
                from: "properties",
                localField: "property_id",
                foreignField: "_id",
                as: "property",
              },
            },
            {
              $unwind: {
                path: "$property",
                preserveNullAndEmptyArrays: true,
              },
            },
            {
              $project: {
                _id: 1,
                created_at: 1,
                status: 1,
                offer_amount: 1,
                transection_id: 1,
                "user._id": 1,
                "user.name": 1,
                "user.email": 1,
                "user.image": 1,
                "property._id": 1,
                "property.name": 1,
                "property.image": 1,
                "property.location": 1,
                "property.min_price": 1,
                "property.max_price": 1,
                "property.description": 1,
                "agent._id": 1,
                "agent.name": 1,
                "agent.email": 1,
                "agent.image": 1,
              },
            },
          ])
          .toArray();

        res.status(200).send(result);
      } catch (error) {
        console.error("🚀 ~ app.get error:", error);
        res.status(500).json({
          success: false,
          message: "Failed to fetch bought properties.",
          error: error.message,
        });
      }
    });

    app.patch(
      "/offered-property/update",
      verifyToken,
      verifyAgent,
      async (req, res) => {
        const { offerId, status, propertyId } = req.body;

        try {
          const result = await marketPlaceCollection.updateOne(
            { _id: new ObjectId(offerId) },
            { $set: { status } }
          );
          console.log("Update Result:", result);

          if (status === "ACCEPTED") {
            const rejectResult = await marketPlaceCollection.updateMany(
              {
                _id: { $ne: new ObjectId(offerId) },
                property_id: new ObjectId(propertyId),
                status: "PENDING",
              },
              { $set: { status: "REJECTED" } }
            );
            console.log("Rejected Other Offers:", rejectResult);
          }

          res.status(200).json({ message: `Offer ${status} successfully.` });
        } catch (error) {
          console.error("Error in API:", error);
          res.status(500).json({ error: "Failed to update offer status." });
        }
      }
    );

    //payment intent
    app.post(
      "/create-payment-intent",
      verifyToken,
      verifyUser,
      async (req, res) => {
        const { price } = req.body;
        const amount = parseInt(price * 100);

        const paymentIntent = await stripe.paymentIntents.create({
          amount: amount,
          currency: "usd",
          payment_method_types: ["card"],
        });

        res.send({
          clientSecret: paymentIntent.client_secret,
        });
      }
    );

    //paid status update
    app.patch("/payment", verifyToken, verifyUser, async (req, res) => {
      const { transection_id, property_id, offer_id } = req.body;
      try {
        const filter = { _id: new ObjectId(offer_id) };
        const updatedDoc = {
          $set: {
            transection_id,
            status: "PAID",
            buying_date: new Date(),
          },
        };
        const result = await marketPlaceCollection.updateOne(
          filter,
          updatedDoc
        );
        res.send(result);
      } catch (error) {
        console.error("Error in API:", error);
        res.status(500).json({ error: "Failed to update payment status." });
      }
    });

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    // await client.db("admin").command({ ping: 1 });
    // console.log(
    //   "Pinged your deployment. You successfully connected to MongoDB!"
    // );
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
