const mongoose = require("mongoose") ;

//schemas and models
const userSchema = mongoose.Schema({
    username: String ,
    password: String
})
const organizationSchema = mongoose.Schema({
    name: String,
    title: String,
    members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    admin: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
})

const UserModel = mongoose.model("User", userSchema);
const OrganizationModel = mongoose.model("Organization", organizationSchema);

module.exports = { UserModel, OrganizationModel };