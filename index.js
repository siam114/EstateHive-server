require('dotenv').config()
const express = require('express');
const app = express();
const cors= require('cors');
const port = process.env.PORT || 5000;
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

//middleware
app.use(cors());
app.use(express.json());


const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.2iff3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    const db = client.db('EstateHive')
    const userCollection = db.collection('users')
    const propertyCollection = db.collection('properties')

    //save and update a user in db
    // app.post('/users/:email', async(req,res)=>{
    //   const email = req.params.email;
    //   const query = {email}
    //   const user = req.body
    //   //check user exists in db
    //   const isExist = await userCollection.findOne(query)
    //   if(isExist){
    //     return res.send(isExist)
    //   }

    //   const result = await userCollection.insertOne({...user, timestamp: Date.now()})
    //   res.send(result)
    // })

    //save a property in db
    app.post('/addProperty', async(req,res)=>{
      const property = req.body;
      const result = await propertyCollection.insertOne(property)
      res.send(result)
    })

    //get all property in db
    app.get('/properties', async(req,res)=>{
      const result = await propertyCollection.find().toArray()
      res.send(result)
    })

    //get a property by id
    app.get('/properties/:id', async(req,res)=>{
      const id = req.params.id;
      const query = {_id: new ObjectId(id)}
      const result = await propertyCollection.findOne(query)
      res.send(result)
    })

    // Connect the client to the server	(optional starting in v4.7)
    // await client.connect();
    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);


app.get('/', (req,res)=>{
    res.send('EstateHive is a Real Estate Website')
})

app.listen(port, ()=>{
    console.log(`EstateHive is running on port ${port}`)
})