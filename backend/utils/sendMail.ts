import nodemailer, { Transporter } from "nodemailer";
import ejs from "ejs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

interface IEmailOptions {
    email: string;
    subject: string;
    template: string;
    data: any;
}

export const sendMail = async (options: IEmailOptions) => {
    const transporter: Transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT || '587'),
        service: process.env.SMTP_SERVICE,
        secure: true, // Use `true` for port 465, `false` for all other ports
        auth: {
            user: process.env.SMTP_USER_EMAIL,
            pass: process.env.SMTP_PASSWORD,
        },
    });

    const { email, subject, template, data } = options;


    // get the email template path
    const emailTemplate = path.join(__dirname, `../views/${template}.ejs`);
    const html: string = await ejs.renderFile(emailTemplate, data)

    // render the email template and send
    const message = {
        from: process.env.SMTP_USER_EMAIL,
        to: email,
        subject,
        html
    };

    transporter.sendMail(message);

}