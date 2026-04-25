require("dotenv").config();
const { UserModel, OrganizationModel } = require("./models");
const mongoose = require("mongoose");
const express = require("express");
const jwt = require('jsonwebtoken');
const { authenticate } = require("./auth");


const app = express();

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';

app.use(express.json());

// In-memory data storage (temporary)
let users = [];
let organizations = [];
let boards = [];
let issues = [];

// CREATE
app.post("/signup", async (request, res) => {
    const { username, password } = request.body;
    const existingUser = await UserModel.findOne({ username });
    if (existingUser) {
        return res.status(400).json({ error: "User already exists" });
    }
    await UserModel.create({ username, password });
    res.json({ message: "User created" });
});

app.post("/signin", async (req, res) => {
    const { username, password } = req.body;
    const user = await UserModel.findOne({ username, password });
    if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user._id }, JWT_SECRET);
    res.json({ token });
});

app.post("/organization", authenticate, async (req, res) => {
    const { name, title } = req.body;
    const userId = req.userId;
    const newOrg = await OrganizationModel.create({
        name,
        title,
        admin: userId,
        members: []
    });
    res.json({ message: "Org created", id: newOrg._id });
});

app.get("/organization", authenticate, async (req, res) => {
    const { organizationId } = req.query;
    const userId = req.userId;

    if (organizationId) {
        const organization = await OrganizationModel.findById(organizationId).populate("members", "username");
        if (!organization) {
            return res.status(404).json({ message: "Organization not found" });
        }
        const isMember = organization.members.some(m => m._id.toString() === userId) || organization.admin.toString() === userId;
        if (!isMember) {
            return res.status(403).json({ message: "Not authorized" });
        }
        res.json({ organization });
    } else {
        const organizations = await OrganizationModel.find({
            $or: [{ members: userId }, { admin: userId }]
        }).populate("members", "username");
        res.json({ organizations });
    }
});

app.post("/add-member-to-organization", authenticate, async (req, res) => {
    const userId = req.userId;
    const organizationId = req.body.organizationId;
    const memberUserUsername = req.body.memberUserUsername;

    const organization = await OrganizationModel.findById(organizationId);

    if (!organization || organization.admin.toString() !== userId) {
        return res.status(411).json({ message: "Either this org doesnt exist or you are not an admin of this org" });
    }

    const memberUser = await UserModel.findOne({ username: memberUserUsername });

    if (!memberUser) {
        return res.status(411).json({ message: "No user with this username exists in our db" });
    }

    organization.members.push(memberUser._id);
    await organization.save();

    res.json({ message: "Member added successfully" });
});

app.post("/board", authenticate, (req, res) => {
    const { name, orgId } = req.body;
    const creatorId = req.userId;
    const org = organizations.find(o => o.id === orgId);
    if (!org || !org.members.includes(creatorId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const board = { id: boards.length + 1, name, orgId, issues: [] };
    boards.push(board);
    res.json({ board });
});

app.post("/issue", authenticate, (req, res) => {
    const { title, description, boardId } = req.body;
    const creatorId = req.userId;
    const board = boards.find(b => b.id === boardId);
    if (!board) {
        return res.status(404).json({ error: "Board not found" });
    }
    const org = organizations.find(o => o.boards.includes(boardId));
    if (!org || !org.members.includes(creatorId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const issue = { id: issues.length + 1, title, description, boardId, status: 'todo' };
    issues.push(issue);
    board.issues.push(issue.id);
    res.json({ issue });
});

// READ
app.get("/boards", authenticate, (req, res) => {
    const userId = req.userId;
    const user = users.find(u => u.id === userId);
    if (!user) {
        return res.status(404).json({ error: "User not found" });
    }
    const userBoards = boards.filter(b => b.orgId === user.organization);
    res.json({ boards: userBoards });
});

app.get("/issues", authenticate, (req, res) => {
    const { boardId } = req.query;
    const userId = req.userId;
    const board = boards.find(b => b.id == boardId);
    if (!board) {
        return res.status(404).json({ error: "Board not found" });
    }
    if (board.orgId !== user.organization) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const boardIssues = issues.filter(i => i.boardId == boardId);
    res.json({ issues: boardIssues });
});

app.get("/members", authenticate, async (req, res) => {
    const orgId = req.query.orgId?.trim();
    const userId = req.userId;

    const org = await OrganizationModel.findById(orgId).populate("members", "username");
    if (!org) {
        return res.status(404).json({ error: "Organization not found" });
    }

    const isMember = org.members.some(m => m._id.toString() === userId) || org.admin.toString() === userId;
    if (!isMember) {
        return res.status(403).json({ error: "Not authorized" });
    }

    res.json({ members: org.members });
});

// UPDATE
app.put("/issues", authenticate, (req, res) => {
    const { issueId, updates } = req.body;
    const userId = req.userId;
    const issue = issues.find(i => i.id == issueId);
    if (!issue) {
        return res.status(404).json({ error: "Issue not found" });
    }
    const board = boards.find(b => b.id === issue.boardId);
    if (board.orgId !== user.organization) {
        return res.status(403).json({ error: "Not authorized" });
    }
    Object.assign(issue, updates);
    res.json({ issue });
});

// DELETE
app.delete("/members", authenticate, async (req, res) => {
    const { organizationId, memberId } = req.query;
    const userId = req.userId;

    const organization = await OrganizationModel.findById(organizationId);
    if (!organization || organization.admin.toString() !== userId) {
        return res.status(403).json({ message: "Either this org doesnt exist or you are not an admin of this org" });
    }

    await OrganizationModel.updateOne({ _id: organizationId }, { $pull: { members: memberId } });

    res.json({ message: "Member removed successfully" });
});

mongoose.connect(process.env.MONGO_URI)
    .then(() => {
        console.log("Connected to MongoDB");
        app.listen(3000, () => {
            console.log("Server running on port 3000");
        });
    })
    .catch((err) => {
        console.log("MongoDB connection error:", err);
    });