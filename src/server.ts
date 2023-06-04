import express from "express";
import cors from "cors";
import { PrismaClient } from "@prisma/client";
import {
  generateToken,
  getCurrentBusinessOwner,
  getCurrentClient,
  hash,
  verify,
} from "./auth";

const app = express();
app.use(cors());
// app.options("*", cors());
app.use(express.json());
const prisma = new PrismaClient();

const port = 4000;

//getting all businesses with the category
app.get("/business", async (req, res) => {
  try {
    const businesses = await prisma.business.findMany({
      include: {
        appointments: true,
        category: { include: { services: true } },
      },
    });
    res.send(businesses);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/appointments", async (req, res) => {
  const appointemnts = await prisma.appointment.findMany();
  res.send(appointemnts);
});

app.get("/appointmentsForBusiness/:id", async (req, res) => {
  const token = req.headers.authorization;
  try {
    if (token) {
      const user = await getCurrentClient(token);
      const appointemnts = await prisma.appointment.findMany({
        where: { clientId: user?.id, businessId: Number(req.params.id) },
      });
      res.send(appointemnts);
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

//get a single business with the clients
app.get("/business/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (id) {
      const business = await prisma.business.findUnique({
        where: { id },
        include: {
          appointments: { include: { client: true } },
          businessHours: true,
          category: { include: { services: true } },
        },
      });
      res.send(business);
    } else {
      res.status(404).send("Business not found");
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

//get all categories inculding the businesses
app.get("/categories", async (req, res) => {
  try {
    const categories = await prisma.category.findMany({
      include: {
        businesses: { include: { businessHours: true, appointments: true } },
      },
    });
    res.send(categories);
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

//Create a new business
app.post("/business", async (req, res) => {
  try {
    const { name, phoneNumber, logo } = req.body;
    const newBusinessData = {
      name,
      phoneNumber,
      logo,
    };

    const newBusiness = await prisma.business.create({
      data: {
        ...newBusinessData,
        category: { connect: { id: req.body.categoryId } },
        businessOwner: { connect: { email: req.body.email } },
      },
    });
    res.send(newBusiness);
  } catch (error) {
     //@ts-ignore
    console.log(error.message)
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

//Log-in a business owner that already exists with it's credentials
app.post("/sign-in/businessOwner", async (req, res) => {
  try {
    const { email, password } = req.body;

    //check for any possible error
    const errors: string[] = [];

    if (typeof email !== "string")
      errors.push("Email not provided or not a string!");

    if (typeof password !== "string")
      errors.push("Password not provided or not a string!");

    if (errors.length > 0) {
      return res.status(400).send({ errors });
    }

    //Check if they email exists on our db
    const businessOwner = await prisma.businessOwner.findUnique({
      where: { email },
      include: {
        business: { include: { appointments: true, businessHours: true } },
      },
    });

    //Check if the e-mail and password match
    if (businessOwner && verify(password, businessOwner.password)) {
      const token = generateToken(businessOwner.id);

      res.send({ user: businessOwner, token });
    } else {
      res.status(400).send({ errors: ["Wrong credentials!"] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

//Log-in a client that already exists with it's credentials
app.post("/sign-in/client", async (req, res) => {
  try {
    const { email, password } = req.body;

    //check for any possible error
    const errors: string[] = [];

    if (typeof email !== "string")
      errors.push("Email not provided or not a string!");

    if (typeof password !== "string")
      errors.push("Password not provided or not a string!");

    if (errors.length > 0) {
      return res.status(400).send({ errors });
    }

    //Check if they email exists on our db
    const client = await prisma.client.findUnique({
      where: { email },
      include: {
        appointments: true,
      },
    });

    //Check if the e-mail and password match
    if (client && verify(password, client.password)) {
      const token = generateToken(client.id);

      res.send({ user: client, token });
    } else {
      res.status(400).send({ errors: ["Wrong credentials!"] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

//Create a new account for client
app.post("/sign-up/client", async (req, res) => {
  const { name, email, password, phoneNumber, avatar } = req.body;
  try {
    //Check if the email is already in our db
    const existingClient = await prisma.client.findUnique({
      where: { email },
    });

    //Checking all possible errors
    const errors: string[] = [];
    if (typeof name !== "string")
      errors.push("Name not provided or not a string");

    if (typeof email !== "string")
      errors.push("Email not provided or not a string");

    if (typeof password !== "string")
      errors.push("Password not provided or not a string");

    if (typeof phoneNumber !== "string")
      errors.push("Phone number not provided or not a string");

    if (errors.length > 0) {
      return res.status(400).send({ errors });
    }

    //Make sure they don't create two accounts with the same email
    if (existingClient) {
      return res.status(400).send({ errors: ["Client already exists!"] });
    }

    const clientData = {
      name,
      avatar,
      phoneNumber,
      email,
      password: hash(password),
    };

    const newClient = await prisma.client.create({
      data: clientData,
    });

    const token = generateToken(newClient.id);
    res.send({ newClient: newClient, token });
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

// //Create a new account for users
app.post("/sign-up/businessOwner", async (req, res) => {
  const { email, password, age, name, avatar } = req.body;
  try {
    //Check if the email is already in our db
    const existingUser = await prisma.businessOwner.findUnique({
      where: { email },
    });

    //Checking all possible errors
    const errors: string[] = [];
    if (typeof email !== "string")
      errors.push("Email not provided or not a string");

    if (typeof password !== "string")
      errors.push("Password not provided or not a string");

    if (typeof name !== "string")
      errors.push("Name not provided or not a string");

    if (typeof age !== "number")
      errors.push("Age not provided or not a number");

    //Don't allow a user under 18 to create an account
    if (age < 18)
      errors.push("You can't create an account if you are under 18!");

    if (errors.length > 0) {
      return res.status(400).send({ errors });
    }

    //Make sure they don't create two accounts with the same email
    if (existingUser) {
      return res.status(400).send({ errors: ["User already exists!"] });
    }

    const userData = {
      age,
      avatar,
      name,
      email,
      password: hash(password),
    };

    // const businessData = {
    //   name: req.body.businessName,
    //   category: req.body.category,

    // };

    const newBusinessOwner = await prisma.businessOwner.create({
      data: userData,
      // data: { ...userData, business: { create: businessData } },
    });

    const token = generateToken(newBusinessOwner.id);
    res.send({ newBusinessOwner, token });
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/validate/businessOwner", async (req, res) => {
  try {
    //get the token
    const token = req.headers.authorization;
    if (token) {
      const businessOwner = await getCurrentBusinessOwner(token);
      //check if there is a user with this token
      if (businessOwner) {
        const newToken = generateToken(businessOwner.id);
        //send the user with a new token
        res.send({ user: businessOwner, token: newToken });
      } else {
        //check all possible errors
        res.status(400).send({ errors: ["Invalid token!"] });
      }
    } else {
      res.status(400).send({ errors: ["Token not provided "] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.get("/validate/client", async (req, res) => {
  try {
    //get the token
    const token = req.headers.authorization;
    if (token) {
      const client = await getCurrentClient(token);
      //check if there is a user with this token
      if (client) {
        const newToken = generateToken(client.id);
        //send the user with a new token
        res.send({ client: client, token: newToken });
      } else {
        //check all possible errors
        res.status(400).send({ errors: ["Invalid token!"] });
      }
    } else {
      res.status(400).send({ errors: ["Token not provided "] });
    }
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.post("/appointment", async (req, res) => {
 
    const title = req.body.title;
    const startDate = req.body.startDate;
    const endDate = req.body.endDate;
     const token = req.headers.authorization;
 try {
     if (token) {
       const client = await getCurrentClient(token);
      const newAppointment = await prisma.appointment.create({
        data: {
          title,
          startDate,
          endDate,
          business: {
            connect: { id: Number(req.body.businessId) },
          },
          client: { connect: { email: client?.email } },
        },
      });
      res.send(newAppointment);
  }} catch (error) {
    //@ts-ignore
    console.log(error.message)
    //@ts-ignore
    res.status(404).send({ error: error.message });
  }
});

app.delete("/appointment/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const appointment = await prisma.appointment.delete({ where: { id } });
    res.send("Deleted");
  } catch (error) {
    //@ts-ignore
    res.status(400).send({ errors: [error.message] });
  }
});

app.listen(port, () => {
  console.log(`App is running: http://localhost:${port}`);
});
