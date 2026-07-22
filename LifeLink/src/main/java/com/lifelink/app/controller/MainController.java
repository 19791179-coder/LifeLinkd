package com.lifelink.app.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

@Controller
public class MainController {

    @GetMapping("/")
    public String index() {
        return "index";
    }

    @GetMapping("/sw.js")
    public String serviceWorker() {
        return "forward:/sw.js";
    }
}
