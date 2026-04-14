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
app.post("/signup",(request,res)=>{
    const username = request.body.username;
    const password = request.body.password;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ error: "User already exists" });
    }
    const user = { id: users.length + 1, username, password, organizations: [] };
    users.push(user);
    res.json({ message: "User created" });
});

app.post("/signin", (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
    }
    const token = jwt.sign({ userId: user.id }, JWT_SECRET);
    res.json({ token });
});

app.post("/organization", authenticate, (req, res) => {
    const { name } = req.body;
    const creatorId = req.userId;
    const creator = users.find(u => u.id === creatorId);
    if (!creator) {
        return res.status(404).json({ error: "Creator not found" });
    }
    const org = { id: organizations.length + 1, name, members: [creatorId], boards: [] };
    organizations.push(org);
    creator.organizations.push(org.id);
    res.json({ org });
});

app.post("/add-member-to-organization", authenticate, (req, res) => {
    const { orgId, memberId } = req.body;
    const adderId = req.userId;
    const org = organizations.find(o => o.id === orgId);
    if (!org) {
        return res.status(404).json({ error: "Organization not found" });
    }
    if (!org.members.includes(adderId)) {
        return res.status(403).json({ error: "Not authorized to add members" });
    }
    const member = users.find(u => u.id === memberId);
    if (!member) {
        return res.status(404).json({ error: "Member not found" });
    }
    if (!org.members.includes(memberId)) {
        org.members.push(memberId);
        member.organizations.push(orgId);
    }
    res.json({ org });
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
    org.boards.push(board.id);
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
    const userBoards = boards.filter(b => user.organizations.includes(b.orgId));
    res.json({ boards: userBoards });
});

app.get("/issues", authenticate, (req, res) => {
    const { boardId } = req.query;
    const userId = req.userId;
    const board = boards.find(b => b.id == boardId);
    if (!board) {
        return res.status(404).json({ error: "Board not found" });
    }
    const org = organizations.find(o => o.id === board.orgId);
    if (!org.members.includes(userId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const boardIssues = issues.filter(i => i.boardId == boardId);
    res.json({ issues: boardIssues });
});

app.get("/members", authenticate, (req, res) => {
    const { orgId } = req.query;
    const userId = req.userId;
    const org = organizations.find(o => o.id == orgId);
    if (!org) {
        return res.status(404).json({ error: "Organization not found" });
    }
    if (!org.members.includes(userId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    const members = users.filter(u => org.members.includes(u.id));
    res.json({ members });
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
    const org = organizations.find(o => o.id === board.orgId);
    if (!org.members.includes(userId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    Object.assign(issue, updates);
    res.json({ issue });
});

// DELETE
app.delete("/members", authenticate, (req, res) => {
    const { orgId, memberId } = req.body;
    const removerId = req.userId;
    const org = organizations.find(o => o.id == orgId);
    if (!org) {
        return res.status(404).json({ error: "Organization not found" });
    }
    if (!org.members.includes(removerId)) {
        return res.status(403).json({ error: "Not authorized" });
    }
    org.members = org.members.filter(id => id !== memberId);
    const member = users.find(u => u.id === memberId);
    if (member) {
        member.organizations = member.organizations.filter(id => id !== orgId);
    }
    res.json({ message: "Member removed" });
});

app.listen(3000, () => {
    console.log("Server running on port 3000");
});